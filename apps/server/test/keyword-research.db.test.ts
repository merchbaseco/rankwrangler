import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { appKeywordDirectoryInput } from '@/api/keyword-directory-input';
import { discoveryTargets, keywordStandingObservations } from '@/db/discovery-target-schema';
import { stopDiscoveryWork } from '@/db/discovery-work';
import { db } from '@/db/index';
import { listKeywordDirectory } from '@/db/keyword-directory';
import { readKeywordDirectoryDetail } from '@/db/keyword-directory-detail';
import { products } from '@/db/product-schema';
import { refreshKeywordStandings } from '@/db/refresh-keyword-standings';
import { productFacets, productFacetValues, productShortNames } from '@/db/schema';
import { getShortNameInputFingerprint } from '@/services/product-short-name-request';
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

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword research reads', () => {
    beforeEach(resetDiscoveryFixture);

    it('stores the head in page order and records each standing observation', async () => {
        const target = await observeKeyword('fishing grandpa', [
            ['B0RSH00003', 50_000],
            ['B0RSH00001', 10_000],
            ['B0RSH00002', 90_000],
        ]);
        const [standing] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, target.id));
        const heads = await db.select().from(products);
        const asinById = new Map(heads.map(row => [row.id, row.asin]));
        expect(standing.headProductIds.map(id => asinById.get(id))).toEqual([
            'B0RSH00003',
            'B0RSH00001',
            'B0RSH00002',
        ]);
        const history = await db
            .select()
            .from(keywordStandingObservations)
            .where(eq(keywordStandingObservations.queryId, target.queryId));
        expect(history).toMatchObject([
            { popularityScore: 76, standingTier: 'hot', source: 'search', observedAt: now },
        ]);
    });

    it('extends score history from stored ranks only when the score moves', async () => {
        const target = await observeKeyword('retro fishing', [['B0RSH00011', 100_000]]);
        await refreshKeywordStandings(new Date(now.getTime() + 1000));
        expect(await observationCount(target.queryId)).toBe(1);
        await db
            .update(discoveryTargets)
            .set({ popularityScore: 10 })
            .where(eq(discoveryTargets.id, target.id));
        await db.execute(
            sql`update discovery_source_scans set next_due_at='2000-01-01' where key='keyword-standing'`
        );
        await refreshKeywordStandings(new Date(now.getTime() + 2000));
        const rows = await db
            .select()
            .from(keywordStandingObservations)
            .where(eq(keywordStandingObservations.queryId, target.queryId));
        expect(rows.map(row => row.source).sort()).toEqual(['search', 'storedRanks']);
    });

    it('returns the shelf, median, fresh count, facet, delta and weekly trend', async () => {
        const target = await observeKeyword('bass fishing gifts', [
            ['B0RSH00021', 40_000, new Date(now.getTime() - 10 * DAY)],
            ['B0RSH00022', 20_000],
            ['B0RSH00023', 60_000],
            ['B0RSH00024', 80_000],
        ]);
        await db.insert(keywordStandingObservations).values([
            {
                targetId: target.id,
                queryId: target.queryId,
                observedAt: new Date(now.getTime() - 8 * DAY),
                popularityScore: 40,
                standingTier: 'warm',
                source: 'search',
            },
            {
                targetId: target.id,
                queryId: target.queryId,
                observedAt: new Date(now.getTime() - 30 * DAY),
                popularityScore: 20,
                standingTier: 'cold',
                source: 'search',
            },
        ]);
        await attachFacet('B0RSH00021', 'hobby', 'fishing');
        await attachFacet('B0RSH00022', 'hobby', 'fishing');
        await attachFacet('B0RSH00023', 'animal', 'bass');
        await storeShortName('B0RSH00021', 'Bass Grandpa', true);
        await storeShortName('B0RSH00022', 'Stale Name', false);
        const [detail] = await readKeywordDirectoryDetail(
            [{ queryId: target.queryId, score: 88 }],
            now.toISOString()
        );
        expect(detail.shelf.map(product => product.asin)).toEqual([
            'B0RSH00021',
            'B0RSH00022',
            'B0RSH00023',
            'B0RSH00024',
        ]);
        expect(detail.shelf.map(product => product.shortName)).toEqual([
            'Bass Grandpa',
            null,
            null,
            null,
        ]);
        expect(detail.medianBsr).toBe(50_000);
        expect(detail.freshCount).toBe(1);
        expect(detail.facet).toEqual({ facet: 'hobby', name: 'fishing' });
        expect(detail.scoreDelta7d).toBe(48);
        expect(detail.scoreTrend12w.map(point => point.score)).toEqual([20, 20, 20, 40, 88]);
        expect(detail.scoreTrend12w.at(-1)?.at).toBe(now.toISOString());
    });

    it('sorts by research measures and filters by dominant facet', async () => {
        await observeKeyword('slow niche', [['B0RSH00031', 400_000]], 0);
        await observeKeyword('strong niche', [['B0RSH00032', 2_000]], 1);
        await attachFacet('B0RSH00032', 'profession', 'nurse');
        const terms = async (input: Parameters<typeof appKeywordDirectoryInput.parse>[0]) =>
            (await listKeywordDirectory(appKeywordDirectoryInput.parse(input))).items.map(
                item => item.term
            );
        expect(await terms({ sort: 'medianBsr' })).toEqual(['strong niche', 'slow niche']);
        expect(await terms({ sort: 'score' })).toEqual(['strong niche', 'slow niche']);
        expect(await terms({ facet: 'profession' })).toEqual(['strong niche']);
        const first = await listKeywordDirectory(
            appKeywordDirectoryInput.parse({ sort: 'medianBsr', limit: 1 })
        );
        expect(first.nextCursor?.sort).toBe('medianBsr');
        const next = await listKeywordDirectory(
            appKeywordDirectoryInput.parse({ limit: 1, cursor: first.nextCursor })
        );
        expect(next.items.map(item => item.term)).toEqual(['slow niche']);
    });
});

const observeKeyword = async (term: string, heads: [string, number, Date?][], offsetDays = 0) => {
    const at = new Date(now.getTime() + offsetDays * DAY);
    const target = await seedDiscoveryTarget({ kind: 'keyword', term }, at);
    await primeCatalogCapacity(at);
    const work = await claimDiscoveryFixture(at);
    await acceptDiscoveryFixture(
        work,
        heads.map(([asin, rank, firstAvailable]) =>
            discoveryProduct(asin, {
                rootCategoryBsr: rank,
                fetchedAt: at.toISOString(),
                dateFirstAvailable: (firstAvailable ?? new Date(at.getTime() - 400 * DAY))
                    .toISOString()
                    .slice(0, 10),
            })
        ),
        at,
        null
    );
    await stopDiscoveryWork({
        passId: work.pass.id,
        claimToken: work.claimToken,
        reason: 'complete',
        now: at,
    });
    return target;
};

const observationCount = async (queryId: string) =>
    (
        await db
            .select()
            .from(keywordStandingObservations)
            .where(eq(keywordStandingObservations.queryId, queryId))
    ).length;

const attachFacet = async (asin: string, facet: string, name: string) => {
    const [value] = await db
        .insert(productFacetValues)
        .values({ facet, name })
        .onConflictDoUpdate({
            target: [productFacetValues.facet, productFacetValues.name],
            set: { name },
        })
        .returning();
    const [product] = await db.select().from(products).where(eq(products.asin, asin));
    await db.insert(productFacets).values({ productId: product.id, facetValueId: value.id });
};

/** A ready short name, fingerprinted to the Product's title and image unless `current` is false. */
const storeShortName = async (asin: string, shortName: string, current: boolean) => {
    const [product] = await db.select().from(products).where(eq(products.asin, asin));
    await db.insert(productShortNames).values({
        marketplaceId: product.marketplaceId,
        asin,
        inputFingerprint: getShortNameInputFingerprint(
            current ? (product.title ?? '') : 'an older title',
            product.thumbnailUrl ?? ''
        ),
        state: 'ready',
        shortName,
    });
};
