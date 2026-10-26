import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { productSearchInput } from '@/api/product-search-input';
import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import { persistDiscoveredSpApiProducts } from '@/services/spapi-keyword-discovery';
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { eventLogs } from '@/db/ops-schema';
import { minedKeywordCandidates } from '@/db/keyword-mining-schema';
import { listKeywordDirectory } from '@/db/keyword-directory';
import {
    claimKeywordAutocomplete,
    saveAutocompleteSuggestions,
    claimAutocompleteJudgments,
    finishKeywordAutocomplete,
    releaseKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
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
        it('shows queued candidates and keeps rejected candidates in the untracked filter', async () => {
            await seedDiscoveryTarget({ kind: 'keyword', term: 'hawaiian christmas' });
            const work = await claimKeywordAutocomplete(now);
            if (!work) throw new Error('Missing seed');
            await saveAutocompleteSuggestions(
                work,
                ['hawaiian christmas shirt', 'hawaiian christmas cards'],
                now
            );
            const initial = await listKeywordDirectory(keywordDirectoryInput.parse({}));
            expect(initial.items).toHaveLength(3);
            expect(initial.items.find(row => row.term === work.term)).toMatchObject({
                status: 'queued',
                untrackedReason: null,
                merch: 0,
            });
            expect(initial.items.find(row => row.term.endsWith('shirt'))).toMatchObject({
                status: 'queued',
                untrackedReason: null,
            });
            const batch = await claimAutocompleteJudgments(work, now);
            await saveKeywordJudgments(
                work,
                batch.map(row => ({
                    id: row.id,
                    probability: row.term.endsWith('shirt') ? 0.95 : 0.05,
                })),
                now
            );
            expect(await finishKeywordAutocomplete(work, now)).toBe(true);
            expect(await finishKeywordAutocomplete(work, now)).toBe(false);
            const admitted = await listKeywordDirectory(keywordDirectoryInput.parse({}));
            expect(admitted.items).toHaveLength(2);
            expect(admitted.items.find(row => row.term.endsWith('shirt'))).toMatchObject({
                status: 'queued',
                sources: ['autocomplete'],
            });
            expect(
                (await listKeywordDirectory(keywordDirectoryInput.parse({ state: 'untracked' })))
                    .items
            ).toHaveLength(1);
            const logs = await db.select().from(eventLogs).where(eq(eventLogs.category, 'keyword'));
            expect(logs.filter(row => row.action === 'keyword.expanded')).toHaveLength(1);
            expect(logs.filter(row => row.action === 'keyword.qualified')).toHaveLength(2);
            expect(logs.filter(row => row.action === 'keyword.candidate.added')).toHaveLength(2);
            expect(logs.every(row => row.primitiveType === 'keyword')).toBe(true);
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
            expect(directory.items[0]).toMatchObject({ status: 'queued', retryScheduled: true });
        });
        it('preserves sub-millisecond creation times in pagination cursors', async () => {
            await db.execute(sql`insert into mined_keyword_candidates(marketplace_id,term,created_at) values
            ('ATVPDKIKX0DER','first shirt','2026-10-26 12:00:00.123457'),
            ('ATVPDKIKX0DER','second shirt','2026-10-26 12:00:00.123456'),
            ('ATVPDKIKX0DER','third shirt','2026-10-26 12:00:00.123455')`);
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
            await db.insert(minedKeywordCandidates).values(
                ['fishing shirt', 'fishing boat shirt', '100% fishing shirt'].map(term => ({
                    term,
                    marketplaceId: 'ATVPDKIKX0DER',
                    createdAt: now,
                }))
            );
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
