import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { appProductSearchInput, productSearchFacetsInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { searchStoredProducts } from '@/db/product-search';
import { readProductSearchFacets } from '@/db/product-search-facets';
import { countStoredProducts, EXACT_TOTAL_LIMIT } from '@/db/product-search-total';
import { writeProductHistorySeries } from '@/db/product/product-history-series';
import { productFacets, productFacetValues, products } from '@/db/schema';
import { buildKeepaHistorySeries, dateToKeepaMinute } from '@/services/keepa-history-series';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-10-28T15:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

const page = (input: Parameters<typeof appProductSearchInput.parse>[0]) =>
    searchStoredProducts(appProductSearchInput.parse(input), now);
const total = (input: Parameters<typeof appProductSearchInput.parse>[0]) =>
    countStoredProducts(appProductSearchInput.parse(input), now);
const facets = (input: Parameters<typeof productSearchFacetsInput.parse>[0]) =>
    readProductSearchFacets(productSearchFacetsInput.parse(input), now);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Explore grid search', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Grid search tests require the private loopback test database.');
        }
        await db.execute(
            sql`truncate products, official_brands, catalog_queries, operations, product_facet_values cascade`
        );
    });

    it('pages by offset with an exact total and ignores the cursor when a page is given', async () => {
        for (let index = 1; index <= 7; index += 1) {
            await insertProduct(`B00000000${index}`, { rootCategoryBsr: index * 1000 });
        }
        const first = await page({ sort: 'salesRankAsc', page: 1, pageSize: 3 });
        const third = await page({
            sort: 'salesRankAsc',
            page: 3,
            pageSize: 3,
            cursor: first.nextCursor,
        });
        expect(first.items.map(item => item.asin)).toEqual([
            'B000000001',
            'B000000002',
            'B000000003',
        ]);
        expect(third.items.map(item => item.asin)).toEqual(['B000000007']);
        expect(third.nextCursor).toBeNull();
        const continued = await page({ sort: 'salesRankAsc', limit: 3, cursor: first.nextCursor });
        expect(continued.items.map(item => item.asin)).toEqual([
            'B000000004',
            'B000000005',
            'B000000006',
        ]);
        expect(await total({})).toEqual({ total: 7, totalIsEstimate: false });
        expect(await total({ salesRank: { max: 2000 } })).toEqual({
            total: 2,
            totalIsEstimate: false,
        });
    });

    it('switches to a planner estimate past the exact bound', async () => {
        await db.execute(sql`insert into products (marketplace_id, asin, title, is_merch_listing, root_category_bsr)
            select ${market}, 'B' || lpad(n::text, 9, '0'), 'Bulk shirt', true, n
            from generate_series(1, ${EXACT_TOTAL_LIMIT + 50}) n`);
        await db.execute(sql`analyze products`);
        const result = await total({});
        expect(result.totalIsEstimate).toBe(true);
        expect(result.total).toBeGreaterThan(EXACT_TOTAL_LIMIT);
        expect(await total({ salesRank: { max: 100 } })).toEqual({
            total: 100,
            totalIsEstimate: false,
        });
    });

    it('filters a non-adjacent tier union, published windows and niche presence', async () => {
        await insertProduct('B0ELITE001', { rootCategoryBsr: 2_500 });
        await insertProduct('B0HOT00001', { rootCategoryBsr: 2_501 });
        await insertProduct('B0STEADY01', { rootCategoryBsr: 250_000 });
        await insertProduct('B0SLOW0001', { rootCategoryBsr: 250_001 });
        await insertProduct('B0UNRANKED', { rootCategoryBsr: null });
        const asins = async (input: Parameters<typeof appProductSearchInput.parse>[0]) =>
            (await page({ sort: 'salesRankAsc', ...input })).items.map(item => item.asin);
        expect(await asins({ tiers: ['elite', 'steady'] })).toEqual(['B0ELITE001', 'B0STEADY01']);
        expect(await asins({ tiers: ['slow'] })).toEqual(['B0SLOW0001', 'B0UNRANKED']);
        await db.execute(sql`truncate products cascade`);

        await insertProduct('B0TODAY001', { dateFirstAvailable: daysAgo(0) });
        await insertProduct('B0DAY59001', { dateFirstAvailable: utcDay(59) });
        await insertProduct('B0DAY60001', { dateFirstAvailable: utcDay(60) });
        await insertProduct('B0DAY36401', { dateFirstAvailable: utcDay(364) });
        await insertProduct('B0DAY36501', { dateFirstAvailable: utcDay(365) });
        await insertProduct('B0UNDATED1', { dateFirstAvailable: null });
        expect((await asins({ published: 'last60d' })).sort()).toEqual([
            'B0DAY59001',
            'B0TODAY001',
        ]);
        expect(await asins({ published: 'lastYear' })).toHaveLength(4);
        expect(await asins({ published: 'any' })).toHaveLength(6);
        await attachFacet('B0TODAY001', 'hobby', 'fishing');
        expect(await asins({ niche: 'has' })).toEqual(['B0TODAY001']);
        expect(await asins({ niche: 'none' })).toHaveLength(5);
    });

    it('counts each sidebar group without its own filter and aggregates KPI bands', async () => {
        await insertProduct('B0FACET001', {
            rootCategoryBsr: 1_000,
            keepaMonthlySold: 400,
            dateFirstAvailable: utcDay(2),
        });
        await insertProduct('B0FACET002', {
            rootCategoryBsr: 2_000,
            keepaMonthlySold: 200,
            dateFirstAvailable: utcDay(2),
        });
        await insertProduct('B0FACET003', {
            rootCategoryBsr: 10_000,
            keepaMonthlySold: 100,
            dateFirstAvailable: utcDay(100),
        });
        await insertProduct('B0FACET004', { rootCategoryBsr: 100_000, dateFirstAvailable: null });
        await insertProduct('B0FACET005', { rootCategoryBsr: null, dateFirstAvailable: utcDay(0) });
        await insertProduct('B0NOTMERCH', { rootCategoryBsr: 500, isMerchListing: false });
        await attachFacet('B0FACET001', 'hobby', 'fishing');
        await attachFacet('B0FACET003', 'hobby', 'fishing');

        const open = await facets({});
        expect(open.total).toBe(5);
        expect(open.totalIsEstimate).toBe(false);
        expect(open.tiers).toEqual({ elite: 2, hot: 1, strong: 0, steady: 1, slow: 1 });
        expect(open.published).toEqual({ last60d: 3, lastYear: 4, any: 5 });
        expect(open.niche).toEqual({ has: 2, none: 3 });
        expect(open.bsrHistogram).toHaveLength(24);
        expect(open.bsrHistogram.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
        expect(open.bsrHistogram.find(bucket => bucket.bucketMax === 2_500)).toMatchObject({
            count: 2,
            tier: 'elite',
        });
        expect(open.medianBsr).toBe(6_000);
        expect(open.medianSoldPerMonth).toBe(200);
        expect(open.publishedPerDay60d).toHaveLength(60);
        expect(open.publishedPerDay60d.at(-1)).toEqual({
            day: now.toISOString().slice(0, 10),
            count: 1,
        });
        expect(open.publishedPerDay60d.reduce((sum, day) => sum + day.count, 0)).toBe(3);
        expect(open.publishedPerDayAvg).toBeCloseTo(3 / 60);

        const elite = await facets({ tiers: ['elite'], published: 'last60d' });
        expect(elite.total).toBe(2);
        // Tier counts ignore the tier filter but keep the published one.
        expect(elite.tiers).toEqual({ elite: 2, hot: 0, strong: 0, steady: 0, slow: 1 });
        // Published counts ignore the published filter but keep the tier one.
        expect(elite.published).toEqual({ last60d: 2, lastYear: 2, any: 2 });
        expect(elite.niche).toEqual({ has: 1, none: 1 });
        expect(elite.medianBsr).toBe(1_500);

        const niche = await facets({ niche: 'has' });
        expect(niche.total).toBe(2);
        expect(niche.niche).toEqual({ has: 2, none: 3 });
        expect(niche.tiers).toEqual({ elite: 1, hot: 1, strong: 0, steady: 0, slow: 0 });

        const empty = await facets({ term: 'nothing matches this' });
        expect(empty).toMatchObject({
            total: 0,
            medianBsr: null,
            improving7dShare: null,
            medianSoldPerMonth: null,
            publishedPerDayAvg: null,
        });
    });

    it('measures the seven-day improvement share from stored history', async () => {
        const rising = await insertProduct('B0RISING01');
        const falling = await insertProduct('B0FALLING1');
        const fresh = await insertProduct('B0FRESH001');
        await insertRank(rising.id, daysAgo(10), 50_000);
        await insertRank(rising.id, daysAgo(1), 20_000);
        await insertRank(falling.id, daysAgo(9), 20_000);
        await insertRank(falling.id, daysAgo(2), 40_000);
        // History that starts inside the week has nothing to compare against.
        await insertRank(fresh.id, daysAgo(3), 1_000);
        expect((await facets({})).improving7dShare).toBe(0.5);
    });
});

const utcDay = (back: number) => {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    return new Date(day.getTime() - back * DAY);
};

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [product] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            title: 'Grid shirt',
            isMerchListing: true,
            rootCategoryBsr: 5_000,
            ...extra,
        })
        .returning();
    return product;
};

const attachFacet = async (asin: string, facet: string, name: string) => {
    const [value] = await db
        .insert(productFacetValues)
        .values({ facet, name })
        .onConflictDoUpdate({
            target: [productFacetValues.facet, productFacetValues.name],
            set: { name },
        })
        .returning();
    const [product] = await db.execute<{ id: string }>(
        sql`select id from products where asin=${asin}`
    );
    await db.insert(productFacets).values({ productId: product.id, facetValueId: value.id });
};

const insertRank = async (productId: string, at: Date, value: number) => {
    const series = buildKeepaHistorySeries('bsr_main', -1, [[dateToKeepaMinute(at), value]]);
    if (!series) throw new Error('Invalid test rank');
    await writeProductHistorySeries(db, productId, [series], {
        source: 'keepa',
        prefer: 'incoming',
    });
};
