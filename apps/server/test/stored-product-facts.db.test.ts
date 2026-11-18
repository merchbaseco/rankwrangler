import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { productSearchFacetsInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { BRAND_DESIGN_COUNT_LIMIT, getProductAppDetail } from '@/db/product/product-app-detail';
import { writeProductHistorySeries } from '@/db/product/product-history-series';
import { mergeProducts } from '@/db/product/merge-products';
import { productSearchFilters } from '@/db/product-search-filters';
import { products } from '@/db/schema';
import { buildKeepaHistorySeries, dateToKeepaMinute } from '@/services/keepa-history-series';
import { replaceProductFacetsByMarketplaceAsin } from '@/services/product-facet-store';
import { productFacetKeys } from '@/services/product-facet-taxonomy';
import type { ProductInfo } from '@/types';

const market = 'ATVPDKIKX0DER';
const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 86_400_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('stored Product facts', () => {
    beforeEach(async () => {
        await db.execute(sql`truncate products, catalog_queries, product_facet_values cascade`);
        await db.execute(sql`delete from product_search_facet_snapshot`);
    });

    it('counts brand designs like the old regexp scan, through the index, up to a cap', async () => {
        const brands = ['Lure & Lore', '  lure   &  LORE ', 'LURE &\tLORE', 'Other', null, ''];
        for (const [index, brand] of brands.entries()) {
            await insertProduct(`B0BRAND${String(index).padStart(3, '0')}`, { brand });
        }
        await insertProduct('B0BRANDUK1', {
            brand: 'Lure & Lore',
            marketplaceId: 'A1F83G8C2ARO7P',
        });
        for (const brand of ['Lure & Lore', 'other', 'Missing']) {
            const detail = await getProductAppDetail(productInfo('B0BRAND000', brand));
            expect(detail.brandDesignCount).toEqual({
                count: await oldBrandCount(brand),
                isCapped: false,
            });
        }
        expect((await getProductAppDetail(productInfo('B0BRAND000', ' '))).brandDesignCount).toBe(
            null
        );
        const [plan] = await db.execute<{ 'QUERY PLAN': string }>(sql`
            explain select 1 from products where marketplace_id = ${market}
                and lower(btrim(regexp_replace(brand, '[[:space:]]+', ' ', 'g'))) = 'disney'`);
        expect(JSON.stringify(plan)).not.toContain('Seq Scan');

        await db.execute(sql`
            insert into products (marketplace_id, asin, brand)
            select ${market}, 'B1' || lpad(n::text, 8, '0'), 'Disney'
            from generate_series(1, ${BRAND_DESIGN_COUNT_LIMIT + 5}) n`);
        expect(
            (await getProductAppDetail(productInfo('B0BRAND000', 'DISNEY'))).brandDesignCount
        ).toEqual({ count: BRAND_DESIGN_COUNT_LIMIT, isCapped: true });
    });

    it('keeps the stored lowest point equal to the full-series minimum through every write', async () => {
        const product = await insertProduct('B0LOWEST01');
        await writeRanks(product, [
            [200, 900],
            [150, 612],
            [100, 612],
        ]);
        await writeRanks(product, [[50, 1_840]]);
        expect(await storedVsOld(product)).toEqual({
            stored: [612, minute(150)],
            old: [612, minute(150)],
        });
        // The incoming value wins a shared minute, so the best can move off it.
        await writeRanks(product, [[150, 5_000]]);
        expect(await storedVsOld(product)).toEqual({
            stored: [612, minute(100)],
            old: [612, minute(100)],
        });
        await writeRanks(product, [[10, 7]]);
        expect(await storedVsOld(product)).toEqual({
            stored: [7, minute(10)],
            old: [7, minute(10)],
        });

        const missing = await insertProduct('B0LOWEST02');
        await writeRanks(missing, [[5, -1]]);
        expect((await storedVsOld(missing)).stored).toEqual([]);
        expect((await getProductAppDetail(productInfo('B0LOWEST02', null))).bestEverBsr).toBeNull();

        // A series written before the column: the first read fills it from the arrays.
        await db.execute(sql`update product_history_series set lowest_point = null`);
        const detail = await getProductAppDetail(productInfo('B0LOWEST01', null));
        expect(detail.bestEverBsr).toEqual({ value: 7, at: dateAt(10).toISOString() });
        expect((await storedVsOld(product)).stored).toEqual([7, minute(10)]);
    });

    it('keeps has_niche equal to having facet links through the store and merges', async () => {
        const first = await insertProduct('B0NICHE001');
        const second = await insertProduct('B0NICHE002');
        await insertProduct('B0NICHE003');
        await classify('B0NICHE001', { hobby: ['Fishing'] });
        await classify('B0NICHE002', { hobby: ['Golf'], animal: ['Dog'] });
        expect(await nicheDrift()).toEqual([]);
        await classify('B0NICHE002', {});
        expect(await nicheDrift()).toEqual([]);
        expect(await hasNiche(second)).toBe(false);
        await classify('B0NICHE002', { animal: ['Cat'] });
        await db.transaction(tx => mergeProducts(tx, { survivorId: first, otherId: second }));
        expect(await nicheDrift()).toEqual([]);
        expect(await hasNiche(first)).toBe(true);

        // Explore's niche filter reads the column; the old per-row probe agrees.
        for (const niche of ['has', 'none'] as const) {
            const { where } = productSearchFilters(productSearchFacetsInput.parse({ niche }), NOW);
            const ids = await db.execute<{ id: string }>(
                sql`select id from products where ${where} order by id`
            );
            const old = await db.execute<{ id: string }>(sql`
                select id from products p where p.is_merch_listing
                    and p.amazon_listing_status = 'active' and p.marketplace_id = ${market}
                    and ${niche === 'has' ? sql`` : sql`not`}
                        exists (select 1 from product_facets pf where pf.product_id = p.id)
                order by id`);
            expect(ids).toEqual(old);
        }
    });
});

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [row] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            title: 'Shirt',
            brand: 'Independent Studio',
            isMerchListing: true,
            rootCategoryBsr: 5_000,
            ...extra,
        })
        .returning({ id: products.id });
    return row.id;
};

/** The count before the expression index: a regexp over every Product in the marketplace. */
const oldBrandCount = async (brand: string) => {
    const [row] = await db.execute<{ total: number }>(sql`
        select count(*)::int total from products
        where marketplace_id=${market}
            and lower(btrim(regexp_replace(brand,'[[:space:]]+',' ','g')))
                =lower(btrim(regexp_replace(${brand},'[[:space:]]+',' ','g')))`);
    return row?.total ?? 0;
};

const dateAt = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY);
const minute = (daysAgo: number) => dateToKeepaMinute(dateAt(daysAgo));

const writeRanks = async (productId: string, points: [number, number][]) => {
    const series = buildKeepaHistorySeries(
        'bsr_main',
        -1,
        points.map(([daysAgo, value]) => [minute(daysAgo), value] as [number, number])
    );
    if (!series) throw new Error('Invalid test ranks');
    await writeProductHistorySeries(db, productId, [series], {
        source: 'keepa',
        prefer: 'incoming',
    });
};

/** The stored lowest point beside the old read: unnest the series, lowest value, then earliest. */
const storedVsOld = async (productId: string) => {
    const [row] = await db.execute<{ stored: number[]; old: number[] | null }>(sql`
        select s.lowest_point stored, (
            select array[h.v, h.m] from unnest(s.keepa_minutes, s.keepa_values) h(m, v)
            where h.v >= 0 order by h.v asc, h.m asc limit 1
        ) old
        from product_history_series s where s.product_id = ${productId}`);
    return { stored: row?.stored, old: row?.old ?? [] };
};

const classify = (
    asin: string,
    values: Partial<Record<(typeof productFacetKeys)[number], string[]>>
) =>
    replaceProductFacetsByMarketplaceAsin({
        asin,
        marketplaceId: market,
        classification: Object.fromEntries(
            productFacetKeys.map(key => [key, values[key] ?? []])
        ) as never,
    });

/** Products whose has_niche disagrees with whether they carry a facet link. */
const nicheDrift = () =>
    db.execute<{ asin: string }>(sql`
        select asin from products p
        where p.has_niche <> exists (select 1 from product_facets pf where pf.product_id = p.id)`);

const hasNiche = async (id: string) => {
    const [row] = await db.execute<{ has: boolean }>(
        sql`select has_niche has from products where id = ${id}`
    );
    return row?.has;
};

const productInfo = (asin: string, brand: string | null): ProductInfo => ({
    asin,
    marketplaceId: market,
    dateFirstAvailable: null,
    title: 'Shirt',
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
