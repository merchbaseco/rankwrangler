import { beforeEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { appProductSearchInput, productSearchInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { getProductAppDetail } from '@/db/product/product-app-detail';
import { writeProductHistorySeries } from '@/db/product/product-history-series';
import { readBsrSparklines } from '@/db/product/product-bsr-sparklines';
import { listProductKeywords } from '@/db/product-keywords';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    keywordProducts,
    operations,
    productShortNames,
    products,
} from '@/db/schema';
import { readStatsSummary } from '@/db/stats-summary';
import {
    buildKeepaHistorySeries,
    dateToKeepaMinute,
    KEEPA_MISSING_VALUE,
} from '@/services/keepa-history-series';
import { searchAppProducts } from '@/services/product-app-search';
import { getShortNameInputFingerprint } from '@/services/product-short-name-request';
import type { ProductInfo } from '@/types';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-10-25T12:00:00Z');
const DAY = 86_400_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('dashboard Product reads', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Dashboard read tests require the private loopback database.');
        }
        await db.execute(sql`truncate products, catalog_queries, operations cascade`);
    });

    it('samples a daily BSR sparkline with carry-in and omits days before history', async () => {
        const product = await insertProduct('B0APP00001');
        await insertRank(product, now.getTime() - 40 * DAY, 9_000);
        // Keepa time resolves to the minute, so the two points straddle the sample by one.
        await insertRank(product, now.getTime() - 3 * DAY - 60_000, 4_000);
        await insertRank(product, now.getTime() - 3 * DAY + 60_000, 0, true);
        const fresh = await insertProduct('B0APP00002');
        await insertRank(fresh, now.getTime() - 1.5 * DAY, 700);
        const lines = await readBsrSparklines(
            [
                { marketplaceId: market, asin: 'B0APP00001' },
                { marketplaceId: market, asin: 'B0APP00002' },
                { marketplaceId: market, asin: 'B0APPNONE0' },
            ],
            now
        );
        const first = lines.get(`${market}:B0APP00001`) ?? [];
        expect(first).toHaveLength(27);
        expect(first[0]).toEqual({
            at: new Date(now.getTime() - 29 * DAY).toISOString(),
            salesRank: 9_000,
        });
        expect(first.at(-1)?.salesRank).toBe(4_000);
        expect(lines.get(`${market}:B0APP00002`)?.map(point => point.salesRank)).toEqual([
            700, 700,
        ]);
        expect(lines.get(`${market}:B0APPNONE0`)).toEqual([]);
    });

    it('adds only current stored short names to search items', async () => {
        await insertProduct('B0APP00011', { title: 'Reel Cool Grandpa Fishing Shirt' });
        await insertProduct('B0APP00012', { title: 'Changed Title Shirt' });
        await insertShortName('B0APP00011', 'Reel Cool Grandpa Fishing Shirt', 'Reel Cool Grandpa');
        await insertShortName('B0APP00012', 'Old Title Shirt', 'Old Title');
        const result = await searchAppProducts(productSearchInput.parse({ sort: 'salesRankAsc' }));
        const names = Object.fromEntries(result.items.map(item => [item.asin, item.shortName]));
        expect(names).toEqual({ B0APP00011: 'Reel Cool Grandpa', B0APP00012: null });
        expect(result.items[0]).toMatchObject({ cutoutThumbnailUrl: null, bsr30d: [] });
    });

    it('records the search phrase as keyword interest only when asked', async () => {
        await insertProduct('B0APP00031', { title: 'Fishing Grandpa Shirt' });
        const terms = async () =>
            (await db.select({ term: catalogQueries.normalizedTerm }).from(catalogQueries)).map(
                row => row.term
            );
        const live = await searchAppProducts(
            appProductSearchInput.parse({ recordInterest: false, term: 'fish' })
        );
        expect(live.coverage).toBeNull();
        expect(await terms()).toEqual([]);
        await searchAppProducts(appProductSearchInput.parse({ term: 'fishing grandpa' }));
        expect(await terms()).toEqual(['fishing grandpa']);
    });

    it('counts brand designs by normalized brand and finds the best-ever rank', async () => {
        const product = await insertProduct('B0APP00021', { brand: 'Lure & Lore' });
        await insertProduct('B0APP00022', { brand: '  lure   &  LORE ' });
        await insertProduct('B0APP00023', { brand: 'Other Brand' });
        await insertRank(product, now.getTime() - 200 * DAY, 612);
        await insertRank(product, now.getTime() - 100 * DAY, 612);
        await insertRank(product, now.getTime() - DAY, 1_840);
        const detail = await getProductAppDetail(productInfo('B0APP00021', 'Lure & Lore'));
        expect(detail).toEqual({
            shortName: null,
            cutoutThumbnailUrl: null,
            brandDesignCount: 2,
            bestEverBsr: { value: 612, at: new Date(now.getTime() - 200 * DAY).toISOString() },
        });
        expect((await getProductAppDetail(productInfo('B0APP00023', null))).brandDesignCount).toBe(
            null
        );
    });

    it('lists keywords by latest organic placement with page-one totals', async () => {
        const product = await insertProduct('B0APP00031');
        const other = await insertProduct('B0APP00032');
        const placed = await insertQuery('fishing grandpa');
        const unplaced = await insertQuery('grandpa gifts');
        const dropped = await insertQuery('retro fishing');
        for (const queryId of [placed, unplaced, dropped]) {
            await db.insert(keywordProducts).values({
                queryId,
                productId: product,
                firstObservedAt: now,
                lastObservedAt: now,
            });
        }
        await insertRun(placed, now.getTime() - DAY, [other, product]);
        await insertRun(dropped, now.getTime() - 3 * DAY, [product]);
        await insertRun(dropped, now.getTime() - DAY, [other]);
        const result = await listProductKeywords({ marketplaceId: market, asin: 'B0APP00031' });
        expect(result.totals).toEqual({ keywords: 3, pageOne: 1 });
        expect(result.keywords[0]).toMatchObject({
            keyword: 'fishing grandpa',
            position: 2,
            page: 1,
            tier: 'unrated',
            lastObservedAt: now.toISOString(),
        });
        expect(result.keywords.slice(1).map(row => row.position)).toEqual([null, null]);
    });

    it('summarizes catalog and keyword totals', async () => {
        await insertProduct('B0APP00041');
        await insertProduct('B0APP00042', { isMerchListing: false });
        expect(await readStatsSummary(now)).toEqual({
            totalProducts: 2,
            totalMerchProducts: 1,
            keywordsTracked: 0,
            keywordsMinedLastDay: 0,
            keywordsQueued: 0,
        });
    });
});

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [row] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            title: 'Fishing shirt',
            brand: 'Independent Studio',
            isMerchListing: true,
            rootCategoryBsr: 5_000,
            thumbnailUrl: `https://m.media-amazon.com/images/I/${asin}.jpg`,
            ...extra,
        })
        .returning({ id: products.id });
    return row.id;
};

const insertRank = async (productId: string, at: number, value: number, missing = false) => {
    const series = buildKeepaHistorySeries('bsr_main', -1, [
        [dateToKeepaMinute(new Date(at)), missing ? KEEPA_MISSING_VALUE : value],
    ]);
    if (!series) throw new Error('Invalid test rank');
    await writeProductHistorySeries(db, productId, [series], {
        source: 'keepa',
        prefer: 'incoming',
    });
};

const insertShortName = async (asin: string, title: string, shortName: string) => {
    await db.insert(productShortNames).values({
        marketplaceId: market,
        asin,
        inputFingerprint: getShortNameInputFingerprint(
            title,
            `https://m.media-amazon.com/images/I/${asin}.jpg`
        ),
        state: 'ready',
        shortName,
        claimId: randomUUID(),
        attemptedAt: now,
        completedAt: now,
    });
};

const insertQuery = async (term: string) => {
    const [row] = await db
        .insert(catalogQueries)
        .values({ source: 'keepa', marketplaceId: market, normalizedTerm: term, displayTerm: term })
        .returning({ id: catalogQueries.id });
    return row.id;
};

const insertRun = async (queryId: string, at: number, productIds: string[]) => {
    const [operation] = await db
        .insert(operations)
        .values({
            type: 'catalogSearch',
            status: 'completed',
            targetKey: queryId,
            input: {},
            error: { code: 'TEST', message: 'fixture' },
            completedAt: new Date(at),
        })
        .returning({ id: operations.id });
    const [run] = await db
        .insert(catalogSearchRuns)
        .values({
            queryId,
            operationId: operation.id,
            sourceStartedAt: new Date(at),
            sourceCompletedAt: new Date(at),
            trigger: 'automatic',
            resultCount: productIds.length,
            normalizerVersion: 1,
            createdAt: new Date(at),
        })
        .returning({ id: catalogSearchRuns.id });
    await db.insert(catalogSearchResults).values(
        productIds.map((productId, index) => ({
            runId: run.id,
            productId,
            sourcePosition: index + 1,
        }))
    );
};

const productInfo = (asin: string, brand: string | null): ProductInfo => ({
    asin,
    marketplaceId: market,
    dateFirstAvailable: null,
    title: 'Fishing shirt',
    brand,
    isMerchListing: true,
    amazonListingStatus: 'active',
    bullet1: null,
    bullet2: null,
    rootCategoryId: null,
    rootCategoryBsr: 5_000,
    rootCategoryDisplayName: null,
    thumbnail: { status: 'unavailable' },
    keepa: null,
    freshness: { stale: false, updatedAt: null },
});
