import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { productSearchInput } from '@/api/product-search-input';
import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import { persistDiscoveredSpApiProducts } from '@/services/spapi-keyword-discovery';
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { eventLogs } from '@/db/ops-schema';
import { listKeywordDirectory } from '@/db/keyword-directory';
import {
    claimKeywordAutocomplete,
    finishKeywordAutocomplete,
    releaseKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import {
    resetDiscoveryFixture,
    seedDiscoveryTarget,
    claimDiscoveryFixture,
    primeCatalogCapacity,
    acceptDiscoveryFixture,
    discoveryProduct,
    discoveryNow as now,
} from './discovery-fixture';

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'keyword directory and lifecycle logs',
    () => {
        beforeEach(async () => {
            await resetDiscoveryFixture();
            await db.delete(eventLogs).where(eq(eventLogs.category, 'keyword'));
        });
        it('shows autocomplete suggestions as trials awaiting a check and logs the expansion', async () => {
            await seedDiscoveryTarget({ kind: 'keyword', term: 'hawaiian christmas' });
            const work = await claimKeywordAutocomplete(now);
            if (!work) throw new Error('Missing seed');
            expect(
                (await listKeywordDirectory(keywordDirectoryInput.parse({}))).items.find(
                    row => row.term === work.term
                )
            ).toMatchObject({ stage: 'graduated', freshness: 'needsSync', merch: 0 });
            await finishKeywordAutocomplete(
                work,
                ['hawaiian christmas shirt', 'hawaiian christmas cards'],
                now
            );
            const admitted = await listKeywordDirectory(
                keywordDirectoryInput.parse({ stage: 'all' })
            );
            expect(admitted.items).toHaveLength(3);
            expect(admitted.items.find(row => row.term.endsWith('shirt'))).toMatchObject({
                stage: 'trial',
                freshness: 'needsSync',
                sources: ['autocomplete'],
            });
            expect(
                (await listKeywordDirectory(keywordDirectoryInput.parse({}))).items
            ).toHaveLength(1);
            const logs = await db.select().from(eventLogs).where(eq(eventLogs.category, 'keyword'));
            expect(logs.filter(row => row.action === 'keyword.expanded')).toHaveLength(1);
            expect(logs.filter(row => row.action === 'keyword.added')).toHaveLength(3);
            expect(logs.every(row => row.primitiveType === 'keyword')).toBe(true);
        });
        it('records comma-typo searches under the same canonical keyword', async () => {
            await recordProductSearchInterest(
                productSearchInput.parse({ term: 'mele kalikimaka t shirt,' })
            );
            await recordProductSearchInterest(
                productSearchInput.parse({ term: 'mele kalikimaka t shirt' })
            );
            const directory = await listKeywordDirectory(keywordDirectoryInput.parse({}));
            expect(directory.items.map(row => row.term)).toEqual(['mele kalikimaka t shirt']);
            const stored = await db.execute<{ count: number }>(
                sql`select count(*)::int count from catalog_queries`
            );
            expect(stored[0].count).toBe(1);
        });
        it('logs direct user-added keywords once and each accepted discovery page once', async () => {
            await recordProductSearchInterest(productSearchInput.parse({ term: 'fishing shirt' }));
            await recordProductSearchInterest(productSearchInput.parse({ term: 'fishing shirt' }));
            await primeCatalogCapacity();
            const work = await claimDiscoveryFixture();
            const result = await acceptDiscoveryFixture(
                work,
                [discoveryProduct('B0TST00001')],
                now,
                null
            );
            await checkpointDiscoveryPage({
                passId: work.pass.id,
                claimToken: work.claimToken,
                attemptId: result.attemptId,
                page: 0,
                nextPageToken: null,
                observedAt: now,
                products: [discoveryProduct('B0TST00001')],
                persist: persistDiscoveredSpApiProducts,
            });
            const logs = await db.select().from(eventLogs).where(eq(eventLogs.category, 'keyword'));
            expect(logs.filter(row => row.action === 'keyword.added')).toHaveLength(1);
            expect(logs.filter(row => row.action === 'keyword.products.mined')).toHaveLength(1);
        });
        it('logs expansion failure once per owned attempt and shows the retry state', async () => {
            await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
            const work = await claimKeywordAutocomplete(now);
            if (!work) throw new Error('Missing seed');
            await releaseKeywordAutocomplete(work, { failed: true, now });
            await releaseKeywordAutocomplete(work, { failed: true, now });
            const logs = await db
                .select()
                .from(eventLogs)
                .where(eq(eventLogs.action, 'keyword.expansion.failed'));
            expect(logs).toHaveLength(1);
            expect(logs[0].status).toBe('failed');
            const directory = await listKeywordDirectory(keywordDirectoryInput.parse({}));
            expect(directory.items[0]).toMatchObject({
                freshness: 'needsSync',
                retryScheduled: true,
            });
        });
        it('preserves sub-millisecond creation times in pagination cursors', async () => {
            for (const term of ['first shirt', 'second shirt', 'third shirt'])
                await seedDiscoveryTarget({ kind: 'keyword', term });
            await db.execute(sql`update catalog_queries q set created_at=v.created_at::timestamp
            from (values ('first shirt','2026-10-26 12:00:00.123457'),
                ('second shirt','2026-10-26 12:00:00.123456'),
                ('third shirt','2026-10-26 12:00:00.123455')) v(term,created_at)
            where q.normalized_term=v.term`);
            const first = await listKeywordDirectory(
                keywordDirectoryInput.parse({ limit: 1, sort: 'newest' })
            );
            expect(first.nextCursor?.key[5]).toBe(
                -(Date.parse('2026-10-26T12:00:00Z') * 1000 + 123457)
            );
            const remaining = await listKeywordDirectory(
                keywordDirectoryInput.parse({ cursor: first.nextCursor })
            );
            expect(remaining.items.map(row => row.term)).toEqual(['second shirt', 'third shirt']);
        });
        it('paginates equal timestamps without duplicates and filters literal text', async () => {
            for (const term of ['fishing shirt', 'fishing boat shirt', '100% fishing shirt'])
                await seedDiscoveryTarget({ kind: 'keyword', term }, now);
            const first = await listKeywordDirectory(keywordDirectoryInput.parse({ limit: 2 }));
            expect(first.nextCursor).not.toBeNull();
            const second = await listKeywordDirectory(
                keywordDirectoryInput.parse({ limit: 2, cursor: first.nextCursor })
            );
            expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(3);
            expect(
                (await listKeywordDirectory(keywordDirectoryInput.parse({ search: '%' }))).items
            ).toHaveLength(1);
        });
    }
);
