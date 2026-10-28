import { claimKeywordExploration } from '@/db/discovery-work';
import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '@/db/index';
import { catalogQueries } from '@/db/catalog-search-schema';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { keywordAutocomplete } from '@/db/keyword-autocomplete-schema';
import { keywordExplorationPasses } from '@/db/keyword-collection-schema';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { listKeywordDirectory } from '@/db/keyword-directory';
import { countKeywordDirectoryStages } from '@/db/keyword-directory-counts';
import { resetDiscoveryFixture, seedDiscoveryTarget } from './discovery-fixture';

type DirectoryInput = z.input<typeof keywordDirectoryInput>;
const read = (input: DirectoryInput = {}) =>
    listKeywordDirectory(keywordDirectoryInput.parse(input));
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const day = 86_400_000;
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword stage and freshness', () => {
    beforeEach(resetDiscoveryFixture);
    it('derives live, needs sync and syncing from current work and deadlines', async () => {
        const now = new Date();
        const future = new Date(now.getTime() + day);
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        expect((await read()).items[0]).toMatchObject({
            stage: 'graduated',
            freshness: 'needsSync',
        });
        await db
            .update(discoveryTargets)
            .set({ headObservedAt: now, nextCheckAt: future })
            .where(eq(discoveryTargets.id, target.id));
        await db
            .insert(keywordAutocomplete)
            .values({ queryId: target.queryId, stage: 'complete', completedAt: now });
        expect((await read({ freshness: 'live' })).items[0].freshness).toBe('live');
        const [pass] = await db
            .insert(keywordExplorationPasses)
            .values({ targetId: target.id, claimAt: now, claimToken: token, resumeAt: future })
            .returning();
        expect((await read({ freshness: 'syncing' })).items[0].freshness).toBe('syncing');
        expect((await read({ freshness: 'live' })).items).toEqual([]);
        await db
            .update(keywordExplorationPasses)
            .set({ claimAt: new Date(now.getTime() - 360_000) })
            .where(eq(keywordExplorationPasses.id, pass.id));
        // A fresh first page is live; deeper pages waiting their turn do not hold it back.
        expect((await read()).items[0].freshness).toBe('live');
        await db
            .update(discoveryTargets)
            .set({ nextCheckAt: new Date(now.getTime() - 1000) })
            .where(eq(discoveryTargets.id, target.id));
        expect((await read()).items[0].freshness).toBe('needsSync');
    });
    it('separates trial, graduated, dropped and untracked stages and counts each', async () => {
        const now = new Date();
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        const trial = await seedDiscoveryTarget({ kind: 'keyword', term: 'new niche shirt' }, now);
        const dropped = await seedDiscoveryTarget({ kind: 'keyword', term: 'empty shirt' }, now);
        // A trial that failed once is still awaiting its decisive check, never live.
        await db
            .update(discoveryTargets)
            .set({
                tracking: 'trial',
                trialFailures: 1,
                headObservedAt: now,
                nextCheckAt: new Date(now.getTime() + day),
            })
            .where(eq(discoveryTargets.id, trial.id));
        await db
            .update(discoveryTargets)
            .set({ tracking: 'dormant', enabled: false, trialFailures: 2 })
            .where(eq(discoveryTargets.id, dropped.id));
        await db.insert(catalogQueries).values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: 'old phrase',
            displayTerm: 'Old phrase',
        });
        expect((await read()).items.map(row => row.term)).toEqual(['fishing shirt']);
        expect((await read({ stage: 'trial' })).items[0]).toMatchObject({
            term: 'new niche shirt',
            stage: 'trial',
            freshness: 'needsSync',
        });
        expect((await read({ stage: 'dropped' })).items[0]).toMatchObject({
            term: 'empty shirt',
            freshness: null,
            nextCheckAt: null,
            intervalDays: null,
        });
        expect((await read({ stage: 'untracked' })).items.map(row => row.term)).toEqual([
            'old phrase',
        ]);
        expect((await read({ stage: 'all' })).items.map(row => row.stage)).toEqual([
            'graduated',
            'trial',
            'dropped',
            'untracked',
        ]);
        expect(await countKeywordDirectoryStages({ heat: 'all' })).toEqual({
            graduated: 1,
            trial: 1,
            dropped: 1,
            untracked: 1,
        });
        expect(await countKeywordDirectoryStages({ heat: 'all', search: 'shirt' })).toEqual({
            graduated: 1,
            trial: 1,
            dropped: 1,
            untracked: 0,
        });
    });
    it('orders trials by Brand Analytics rank, unranked last, across pages', async () => {
        const now = new Date();
        for (const term of ['rare shirt', 'unranked shirt', 'popular shirt']) {
            const target = await seedDiscoveryTarget({ kind: 'keyword', term }, now);
            await db
                .update(discoveryTargets)
                .set({ tracking: 'trial' })
                .where(eq(discoveryTargets.id, target.id));
        }
        await db.insert(brandAnalyticsSearchTerms).values(
            [
                ['popular shirt', 12],
                ['rare shirt', 4321],
            ].map(([normalizedTerm, rank]) => ({
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: String(normalizedTerm),
                searchFrequencyRank: Number(rank),
                apparelClicks: 2,
                clickedAsins: ['B0TST00001', 'B0TST00002'],
                firstSeenWeek: '2026-10-18',
                lastSeenWeek: '2026-10-18',
            }))
        );
        const first = await read({ stage: 'trial', limit: 2 });
        expect(first.items.map(row => [row.term, row.searchFrequencyRank])).toEqual([
            ['popular shirt', 12],
            ['rare shirt', 4321],
        ]);
        const rest = await read({ stage: 'trial', cursor: first.nextCursor ?? undefined });
        expect(rest.items.map(row => [row.term, row.searchFrequencyRank])).toEqual([
            ['unranked shirt', null],
        ]);
    });
    it('orders graduated keywords syncing, then due by deadline, then live by next check', async () => {
        const now = new Date();
        const at = (offset: number) => new Date(now.getTime() + offset);
        const plan = [
            ['later live shirt', at(-day), at(2 * day)],
            ['overdue shirt', at(-3 * day), at(-2 * day)],
            ['live shirt', at(-day), at(day)],
            ['due shirt', at(-2 * day), at(-day)],
            ['syncing shirt', at(-day), at(day)],
        ] as const;
        for (const [term, headObservedAt, nextCheckAt] of plan) {
            const target = await seedDiscoveryTarget({ kind: 'keyword', term }, now);
            await db
                .update(discoveryTargets)
                .set({ headObservedAt, nextCheckAt })
                .where(eq(discoveryTargets.id, target.id));
            await db
                .insert(keywordAutocomplete)
                .values({ queryId: target.queryId, stage: 'complete' });
            if (term === 'syncing shirt') {
                await db.insert(keywordExplorationPasses).values({
                    targetId: target.id,
                    claimAt: now,
                    claimToken: token,
                    resumeAt: now,
                });
            }
        }
        const rows = (await read()).items;
        expect(rows.map(row => [row.term, row.freshness])).toEqual([
            ['syncing shirt', 'syncing'],
            ['overdue shirt', 'needsSync'],
            ['due shirt', 'needsSync'],
            ['live shirt', 'live'],
            ['later live shirt', 'live'],
        ]);
    });
    it('does not hold a fresh keyword back for its one-time autocomplete expansion', async () => {
        const now = new Date();
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        await db
            .update(discoveryTargets)
            .set({ headObservedAt: now, nextCheckAt: new Date(now.getTime() + day) })
            .where(eq(discoveryTargets.id, target.id));
        expect((await read()).items[0].freshness).toBe('live');
        await db
            .insert(keywordAutocomplete)
            .values({ queryId: target.queryId, claimAt: now, claimToken: token });
        expect((await read()).items[0].freshness).toBe('syncing');
    });
    it('keeps a new product scan due even when autocomplete is waiting to retry', async () => {
        const now = new Date();
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        await db.insert(keywordAutocomplete).values({
            queryId: target.queryId,
            failureCount: 1,
            nextDueAt: new Date(now.getTime() + day),
        });
        await seedDiscoveryTarget(
            { kind: 'keyword', term: 'other shirt' },
            new Date(now.getTime() + 1000)
        );
        const result = await read({ limit: 1 });
        expect(result.items[0]).toMatchObject({
            term: 'fishing shirt',
            freshness: 'needsSync',
            retryScheduled: true,
        });
        expect(result.nextCursor?.key.slice(0, 2)).toEqual([0, 1]);
    });
    it('uses target identity for tied due keywords just like the dispatcher', async () => {
        const now = new Date();
        const first = '00000000-0000-4000-8000-000000000001';
        const second = '00000000-0000-4000-8000-000000000002';
        await db.insert(catalogQueries).values(
            [
                [first, 'first shirt'],
                [second, 'second shirt'],
            ].map(([id, term]) => ({
                id,
                source: 'keepa' as const,
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: term,
                displayTerm: term,
                createdAt: now,
            }))
        );
        await db.insert(discoveryTargets).values(
            [
                [second, first],
                [first, second],
            ].map(([id, queryId]) => ({
                id,
                queryId,
                kind: 'keyword' as const,
                tracking: 'tracked' as const,
                enabled: true,
                createdAt: now,
            }))
        );
        const result = await read({ freshness: 'needsSync' });
        const actual = await claimKeywordExploration(now);
        expect(result.items[0].queryId).toBe(actual?.target.queryId);
        expect(result.items[0].term).toBe('second shirt');
    });
});
