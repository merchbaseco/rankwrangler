import { spApiCatalogCapacity } from '@/db/spapi-capacity-schema';
import { claimKeywordExploration } from '@/db/discovery-work';
import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries } from '@/db/catalog-search-schema';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { keywordAutocomplete } from '@/db/keyword-autocomplete-schema';
import { keywordExplorationPasses } from '@/db/keyword-collection-schema';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { listKeywordDirectory } from '@/db/keyword-directory';
import { resetDiscoveryFixture, seedDiscoveryTarget } from './discovery-fixture';

const read = (state: 'all' | 'queued' | 'scanning' | 'upToDate' | 'untracked' = 'all') =>
    listKeywordDirectory(keywordDirectoryInput.parse({ state }));
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('plain keyword statuses', () => {
    beforeEach(resetDiscoveryFixture);
    it('distinguishes queued, scanning and up to date using the current work and deadlines', async () => {
        const now = new Date();
        const future = new Date(now.getTime() + 86_400_000);
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        expect((await read()).items[0].status).toBe('queued');
        await db
            .update(discoveryTargets)
            .set({ headObservedAt: now, nextCheckAt: future })
            .where(eq(discoveryTargets.id, target.id));
        await db
            .insert(keywordAutocomplete)
            .values({ queryId: target.queryId, stage: 'complete', completedAt: now });
        expect((await read('upToDate')).items[0].status).toBe('upToDate');
        const [pass] = await db
            .insert(keywordExplorationPasses)
            .values({ targetId: target.id, claimAt: now, claimToken: token, resumeAt: future })
            .returning();
        expect((await read('scanning')).items[0].status).toBe('scanning');
        await db
            .update(keywordExplorationPasses)
            .set({ claimAt: new Date(now.getTime() - 360_000) })
            .where(eq(keywordExplorationPasses.id, pass.id));
        // A fresh first page is up to date; deeper pages waiting their turn do not hold it back.
        expect((await read()).items[0].status).toBe('upToDate');
        await db
            .update(keywordExplorationPasses)
            .set({ claimAt: null, claimToken: null, stopReason: 'sourceEnd' })
            .where(eq(keywordExplorationPasses.id, pass.id));
        expect((await read()).items[0].status).toBe('upToDate');
        await db
            .update(discoveryTargets)
            .set({ nextCheckAt: new Date(now.getTime() - 1000) })
            .where(eq(discoveryTargets.id, target.id));
        expect((await read()).items[0].status).toBe('queued');
    });
    it('hides untracked keywords by default and explains the saved reason', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'empty niche shirt' });
        await db
            .update(discoveryTargets)
            .set({ tracking: 'dormant', enabled: false, trialFailures: 2 })
            .where(eq(discoveryTargets.id, target.id));
        await db.insert(catalogQueries).values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: 'old phrase',
            displayTerm: 'Old phrase',
        });
        expect((await read()).items).toEqual([]);
        const rows = (await read('untracked')).items;
        expect(rows).toHaveLength(2);
        expect(rows.find(row => row.term === 'empty niche shirt')).toMatchObject({
            status: 'untracked',
            untrackedReason: 'noMerchFound',
            nextCheckAt: null,
            intervalDays: null,
        });
        expect(rows.find(row => row.term === 'old phrase')?.untrackedReason).toBe('notScheduled');
    });
    it('shows the Brand Analytics rank of a ranked keyword', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'unranked shirt' });
        await db.insert(brandAnalyticsSearchTerms).values({
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: 'fishing shirt',
            searchFrequencyRank: 4321,
            apparelClicks: 2,
            clickedAsins: ['B0TST00001', 'B0TST00002'],
            firstSeenWeek: '2026-10-18',
            lastSeenWeek: '2026-10-18',
        });
        const rows = (await read()).items;
        expect(rows.find(row => row.term === 'fishing shirt')?.searchFrequencyRank).toBe(4321);
        expect(rows.find(row => row.term === 'unranked shirt')?.searchFrequencyRank).toBeNull();
    });
    it('does not hold a fresh keyword back for its one-time autocomplete expansion', async () => {
        const now = new Date();
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        await db
            .update(discoveryTargets)
            .set({ headObservedAt: now, nextCheckAt: new Date(now.getTime() + 86_400_000) })
            .where(eq(discoveryTargets.id, target.id));
        expect((await read()).items[0].status).toBe('upToDate');
        await db
            .insert(keywordAutocomplete)
            .values({ queryId: target.queryId, claimAt: now, claimToken: token });
        expect((await read()).items[0].status).toBe('scanning');
    });
    it('orders ready product scans like the dispatcher and freezes trial preference across pages', async () => {
        const now = new Date();
        const due = new Date(now.getTime() - 2 * 86_400_000);
        const slow = await seedDiscoveryTarget({ kind: 'keyword', term: 'weekly shirt' }, now);
        const urgent = await seedDiscoveryTarget({ kind: 'keyword', term: 'daily shirt' }, now);
        const trial = await seedDiscoveryTarget({ kind: 'keyword', term: 'new niche shirt' }, now);
        for (const [target, interval] of [
            [slow, 7],
            [urgent, 1],
            [trial, 7],
        ] as const) {
            await db
                .update(discoveryTargets)
                .set({
                    headObservedAt: target.id === trial.id ? null : due,
                    nextCheckAt: due,
                    intervalDays: interval,
                    tracking: target.id === trial.id ? 'trial' : 'tracked',
                })
                .where(eq(discoveryTargets.id, target.id));
            await db.insert(keywordExplorationPasses).values({
                targetId: target.id,
                stopReason: 'sourceEnd',
                resumeAt: due,
                createdAt: due,
            });
            if (target.id !== trial.id)
                await db
                    .insert(keywordAutocomplete)
                    .values({ queryId: target.queryId, stage: 'complete' });
        }
        await db.insert(spApiCatalogCapacity).values({ id: 1, discoveryClaims: 1 });
        const first = await listKeywordDirectory(
            keywordDirectoryInput.parse({ state: 'queued', limit: 1 })
        );
        expect(first.items[0].term).toBe('daily shirt');
        await db.update(spApiCatalogCapacity).set({ discoveryClaims: 0 });
        const remaining = await listKeywordDirectory(
            keywordDirectoryInput.parse({ state: 'queued', cursor: first.nextCursor })
        );
        expect(remaining.items.map(row => row.term)).toEqual(['weekly shirt', 'new niche shirt']);
        const newRead = await read('queued');
        expect(newRead.items[0].term).toBe('new niche shirt');
        const actual = await claimKeywordExploration(now);
        expect(actual?.target.id).toBe(trial.id);
        expect((await read()).items[0]).toMatchObject({
            term: 'new niche shirt',
            status: 'scanning',
        });
    });
    it('keeps a new product scan ready even when autocomplete is waiting to retry', async () => {
        const now = new Date();
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        await db.insert(keywordAutocomplete).values({
            queryId: target.queryId,
            failureCount: 1,
            nextDueAt: new Date(now.getTime() + 86_400_000),
        });
        await seedDiscoveryTarget(
            { kind: 'keyword', term: 'other shirt' },
            new Date(now.getTime() + 1000)
        );
        const result = await listKeywordDirectory(keywordDirectoryInput.parse({ limit: 1 }));
        expect(result.items[0].term).toBe('fishing shirt');
        expect(result.nextCursor?.key[0]).toBe(1);
    });
    it('uses target identity for tied scan priorities just like the dispatcher', async () => {
        const now = new Date();
        const first = '00000000-0000-4000-8000-000000000001';
        const second = '00000000-0000-4000-8000-000000000002';
        await db.insert(catalogQueries).values([
            {
                id: first,
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: 'first shirt',
                displayTerm: 'first shirt',
                createdAt: now,
            },
            {
                id: second,
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: 'second shirt',
                displayTerm: 'second shirt',
                createdAt: now,
            },
        ]);
        await db.insert(discoveryTargets).values([
            {
                id: second,
                queryId: first,
                kind: 'keyword',
                tracking: 'tracked',
                enabled: true,
                createdAt: now,
            },
            {
                id: first,
                queryId: second,
                kind: 'keyword',
                tracking: 'tracked',
                enabled: true,
                createdAt: now,
            },
        ]);
        const result = await read('queued');
        const actual = await claimKeywordExploration(now);
        expect(result.items[0].queryId).toBe(actual?.target.queryId);
        expect(result.items[0].term).toBe('second shirt');
    });
});
