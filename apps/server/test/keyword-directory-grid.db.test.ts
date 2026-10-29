import { beforeEach, describe, expect, it } from 'bun:test';
import {
    appKeywordDirectoryInput,
    keywordDirectoryFacetsInput,
} from '@/api/keyword-directory-input';
import { stopDiscoveryWork } from '@/db/discovery-work';
import { readKeywordDirectory } from '@/db/keyword-directory';
import { readKeywordDirectoryFacets } from '@/db/keyword-directory-facets';
import {
    acceptDiscoveryFixture,
    claimDiscoveryFixture,
    discoveryProduct,
    discoveryNow as now,
    primeCatalogCapacity,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const DAY = 86_400_000;
const asOf = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
const view = { asOf, sort: 'newest' as const };

const directory = (input: Parameters<typeof appKeywordDirectoryInput.parse>[0]) =>
    readKeywordDirectory(appKeywordDirectoryInput.parse(input), { view });
const terms = async (input: Parameters<typeof appKeywordDirectoryInput.parse>[0]) =>
    (await directory(input)).items.map(item => item.term).sort();
const facets = (input: Parameters<typeof keywordDirectoryFacetsInput.parse>[0]) =>
    readKeywordDirectoryFacets(keywordDirectoryFacetsInput.parse(input), asOf);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Keywords grid directory', () => {
    beforeEach(async () => {
        await resetDiscoveryFixture();
        await observeKeyword('hot niche', [
            ['B0GRD00001', 500],
            ['B0GRD00002', 600],
            ['B0GRD00003', 700],
            ['B0GRD00004', 800],
            ['B0GRD00005', 900],
        ]);
        await observeKeyword('elite niche', [['B0GRD00011', 1_000]]);
        await observeKeyword('slow niche', [['B0GRD00021', 400_000]]);
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fresh idea' }, now);
    });

    it('filters by heat, stage, freshness, Elite shelf and Merch, and pages by offset with a total', async () => {
        const all = await directory({});
        expect(all.total).toBe(4);
        const byTerm = new Map(all.items.map(item => [item.term, item]));
        expect(byTerm.get('hot niche')).toMatchObject({
            heat: 'hot',
            stage: 'graduated',
            freshness: 'live',
        });
        expect(byTerm.get('elite niche')).toMatchObject({
            heat: 'warm',
            stage: 'graduated',
            freshness: 'live',
        });
        expect(byTerm.get('slow niche')).toMatchObject({
            heat: 'cold',
            stage: 'graduated',
            freshness: 'live',
        });
        expect(byTerm.get('fresh idea')).toMatchObject({ freshness: 'needsSync', merch: 0 });

        expect(await terms({ heat: ['hot', 'cold'] })).toEqual(['hot niche', 'slow niche']);
        expect(await terms({ freshness: ['needsSync'] })).toEqual(['fresh idea']);
        expect(await terms({ freshness: ['live', 'syncing'] })).toHaveLength(3);
        expect(await terms({ shelfElite: 'has' })).toEqual(['elite niche', 'hot niche']);
        expect(await terms({ shelfElite: 'none' })).toEqual(['fresh idea', 'slow niche']);
        expect(await terms({ merch: 'tracked' })).toEqual([
            'elite niche',
            'hot niche',
            'slow niche',
        ]);
        expect(await terms({ merch: 'none' })).toEqual(['fresh idea']);
        expect(await terms({ stage: ['trial', 'dropped'] })).toEqual([]);

        const second = await directory({ page: 2, pageSize: 3 });
        expect(second.total).toBe(4);
        expect(second.items).toHaveLength(1);
        expect(second.nextCursor).toBeNull();
        const past = await directory({ page: 3, pageSize: 3 });
        expect(past).toMatchObject({ items: [], total: 4 });
        const filtered = await directory({ shelfElite: 'has', pageSize: 1 });
        expect(filtered.total).toBe(2);
        expect(filtered.items).toHaveLength(1);
    });

    it('counts each sidebar group without its own filter', async () => {
        const open = await facets({});
        expect(open).toMatchObject({
            total: 4,
            heat: { hot: 1, warm: 1, cold: 1 },
            stage: { graduated: 4, trial: 0, dropped: 0, untracked: 0 },
            freshness: { live: 3, needsSync: 1, syncing: 0 },
            shelf: { hasElite: 2, noElite: 2 },
            merch: { tracked: 3, none: 1 },
            minedLast24h: 3,
            medianShelfBsr: 1_000,
            needsSync: 1,
            syncing: 0,
        });
        expect(open.scoreHistogram).toHaveLength(20);
        expect(open.scoreHistogram.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
        expect(open.scoreHistogram.at(-1)).toMatchObject({ bucketMax: 100, count: 1, heat: 'hot' });
        expect(open.scoreHistogram[15]).toMatchObject({ bucketMax: 80, heat: 'hot' });
        expect(open.scoreHistogram[14]).toMatchObject({ bucketMax: 75, heat: 'warm' });

        const hot = await facets({ heat: ['hot'] });
        expect(hot).toMatchObject({
            total: 1,
            heat: { hot: 1, warm: 1, cold: 1 },
            freshness: { live: 1, needsSync: 0, syncing: 0 },
            shelf: { hasElite: 1, noElite: 0 },
            merch: { tracked: 1, none: 0 },
        });

        const queued = await facets({ freshness: ['needsSync'] });
        expect(queued).toMatchObject({
            total: 1,
            freshness: { live: 3, needsSync: 1, syncing: 0 },
            merch: { tracked: 0, none: 1 },
            medianShelfBsr: null,
        });
        const noElite = await facets({ shelfElite: 'none' });
        expect(noElite.shelf).toEqual({ hasElite: 2, noElite: 2 });
        expect(noElite.total).toBe(2);
    });
});

const observeKeyword = async (term: string, heads: [string, number][]) => {
    const target = await seedDiscoveryTarget({ kind: 'keyword', term }, now);
    await primeCatalogCapacity(now);
    const work = await claimDiscoveryFixture(now);
    await acceptDiscoveryFixture(
        work,
        heads.map(([asin, rank]) =>
            discoveryProduct(asin, {
                rootCategoryBsr: rank,
                fetchedAt: now.toISOString(),
                dateFirstAvailable: new Date(now.getTime() - 400 * DAY).toISOString().slice(0, 10),
            })
        ),
        now,
        null
    );
    await stopDiscoveryWork({
        passId: work.pass.id,
        claimToken: work.claimToken,
        reason: 'complete',
        now,
    });
    return target;
};
