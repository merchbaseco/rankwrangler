import { keywordProducts } from '@/db/keyword-collection-schema';
import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { productSearchInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { searchStoredProducts } from '@/db/product-search';
import { InvalidProductSearchCursorError } from '@/db/product-search-sort';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    officialBrands,
    operations,
    productFacets,
    productFacetValues,
    products,
} from '@/db/schema';
import { searchProducts } from '@/services/product-search';

const market = 'ATVPDKIKX0DER';
const search = (input: Parameters<typeof productSearchInput.parse>[0]) =>
    searchStoredProducts(productSearchInput.parse(input));

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('stored Merch research search', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            !['rankwrangler_search_test', 'rankwrangler_catalog_test'].includes(
                process.env.RANKWRANGLER_DATABASE_NAME ?? ''
            )
        ) {
            throw new Error('Product search tests require the private loopback test database.');
        }
        await db.execute(
            sql`truncate products, official_brands, catalog_queries, operations, product_facet_values cascade`
        );
    });

    it('finds independent discoveries and returns screening metrics without provider work', async () => {
        await insertProduct('B000000001', {
            title: 'Fishing dad shirt',
            rootCategoryBsr: 250_000,
            keepaCurrentBsr: 999_999,
            keepaCurrentNewPrice: 1999,
            keepaMonthlySold: 50,
            keepaBsrAverage30: 270_000,
            keepaSalesRankDrops30: 12,
        });
        await insertProduct('B000000002', { title: 'Fishing dad shirt', isMerchListing: false });
        await insertProduct('B000000003', {
            title: 'Fishing dad shirt',
            amazonListingStatus: 'deleted',
        });
        const result = await searchProducts(
            productSearchInput.parse({ term: 'fishing', salesRank: { max: 300_000 } })
        );
        expect(result.items.map(item => item.asin)).toEqual(['B000000001']);
        expect(result.items[0]).toMatchObject({
            salesRank: 250_000,
            price: { amountMinor: 1999, currencyCode: 'USD' },
            averages: { last30Days: 270_000, last90Days: null },
            demand: { boughtInPastMonth: 50, salesRankDrops: { last30Days: 12 } },
        });
        expect(result.coverage).toEqual({
            keyword: 'fishing',
            headCheckedAt: null,
            exploration: null,
        });
        const [candidate] = await db.select().from(catalogQueries);
        expect(candidate.activeUntil).toBeNull();
        expect(candidate.latestSuccessfulRunAt).toBeNull();
        await searchProducts(productSearchInput.parse({ term: '  FISHING  ' }));
        expect(
            (await db.select().from(catalogQueries)).map(query => query.normalizedTerm).sort()
        ).toEqual(['fishing']);
        expect(await db.select().from(operations)).toHaveLength(0);
    });

    it('paginates ties and missing ranks once, with missing values last in either direction', async () => {
        await insertProduct('B000000001', { rootCategoryBsr: 10 });
        await insertProduct('B000000002', { rootCategoryBsr: 10 });
        await insertProduct('B000000003', { rootCategoryBsr: 20 });
        await insertProduct('B000000004', { rootCategoryBsr: null });
        await insertProduct('B000000005', { rootCategoryBsr: null });
        for (const sort of ['salesRankAsc', 'salesRankDesc'] as const) {
            const asins: string[] = [];
            let cursor: string | null = null;
            do {
                const page = await search({ sort, limit: 2, cursor });
                asins.push(...page.items.map(item => item.asin));
                cursor = page.nextCursor;
            } while (cursor);
            expect(asins).toHaveLength(5);
            expect(new Set(asins).size).toBe(5);
            expect(new Set(asins.slice(-2))).toEqual(new Set(['B000000004', 'B000000005']));
            const ranks = asins.map(
                asin =>
                    ({
                        B000000001: 10,
                        B000000002: 10,
                        B000000003: 20,
                        B000000004: null,
                        B000000005: null,
                    })[asin]
            );
            expect(ranks).toEqual(
                sort === 'salesRankDesc' ? [20, 10, 10, null, null] : [10, 10, 20, null, null]
            );
        }
    });

    it('rejects malformed and mismatched cursors', async () => {
        await insertProduct('B000000001');
        await insertProduct('B000000002');
        const page = await search({ limit: 1 });
        await expect(
            search({ limit: 1, term: 'fishing', cursor: page.nextCursor })
        ).rejects.toBeInstanceOf(InvalidProductSearchCursorError);
        await expect(search({ cursor: 'bad cursor' })).rejects.toBeInstanceOf(
            InvalidProductSearchCursorError
        );
    });

    it('preserves timestamp precision across page boundaries', async () => {
        await insertProduct('B000000001');
        await insertProduct('B000000002');
        await db.execute(
            sql`update products set created_at = '2026-01-01 00:00:00.000123'::timestamp where asin='B000000001'`
        );
        await db.execute(
            sql`update products set created_at = '2026-01-01 00:00:00.000122'::timestamp where asin='B000000002'`
        );
        const page = await search({ sort: 'discoveredAtDesc', limit: 1 });
        expect(page.items[0].asin).toBe('B000000001');
        const next = await search({ sort: 'discoveredAtDesc', limit: 1, cursor: page.nextCursor });
        expect(next.items.map(item => item.asin)).toEqual(['B000000002']);
    });

    it('excludes exact evidenced official brands while unknown brands stay visible', async () => {
        await insertProduct('B000000001', { brand: '  Official   Brand  ' });
        await insertProduct('B000000002', { brand: 'Official Brand Fans' });
        await insertProduct('B000000003', { brand: null });
        await db.insert(officialBrands).values({
            marketplaceId: market,
            normalizedBrand: 'official brand',
            displayBrand: 'Official Brand',
            evidenceUrl: 'https://example.com/brand',
            verifiedAt: new Date(),
        });
        expect(new Set((await search({})).items.map(item => item.asin))).toEqual(
            new Set(['B000000002', 'B000000003'])
        );
        expect((await search({ includeOfficialBrands: true })).items).toHaveLength(3);
        expect(
            (await search({ brands: ['Official Brand Fans'] })).items.map(item => item.asin)
        ).toEqual(['B000000002']);
    });

    it('applies word, title and structured filters before paging', async () => {
        await insertProduct('B000000001', { title: 'Fishing bass shirt', rootCategoryBsr: 20 });
        await insertProduct('B000000002', {
            title: 'Fishing dad shirt',
            rootCategoryBsr: 30,
            dateFirstAvailable: new Date('2026-08-01'),
        });
        await insertProduct('B000000003', {
            title: 'Garden shirt',
            bullet1: 'I love fishing',
            rootCategoryBsr: 10,
        });
        const page = await search({
            term: 'fishing',
            textFields: 'title',
            excludeWords: ['bass'],
            salesRank: { max: 50 },
            firstAvailableAt: { after: '2026-07-01' },
            limit: 1,
        });
        expect(page.items.map(item => item.asin)).toEqual(['B000000002']);
        expect(page.nextCursor).toBeNull();
        expect((await search({ term: 'fish' })).items).toHaveLength(0);
    });

    it('combines facet alternatives and preserves explicit unknown classification', async () => {
        const fishing = await insertProduct('B000000001');
        const nurse = await insertProduct('B000000002', { isMerchListing: null });
        const [hobby, profession] = await db
            .insert(productFacetValues)
            .values([
                { facet: 'hobby', name: 'fishing' },
                { facet: 'profession', name: 'nurse' },
            ])
            .returning();
        await db.insert(productFacets).values([
            { productId: fishing.id, facetValueId: hobby.id },
            { productId: nurse.id, facetValueId: profession.id },
        ]);
        const facets = [
            { facet: 'hobby', name: 'fishing' },
            { facet: 'profession', name: 'nurse' },
        ];
        expect((await search({ facets, isMerchListing: 'all' })).items).toHaveLength(2);
        expect(
            (await search({ facets, isMerchListing: 'unknown' })).items.map(item => item.asin)
        ).toEqual(['B000000002']);
        expect((await search({ facets, salesRank: { min: 500 } })).items).toHaveLength(0);
    });

    it('finds observed keyword membership even when listing text does not contain the phrase', async () => {
        const product = await insertProduct('B000000001', { title: 'Weekend lake club' });
        const [query] = await db
            .insert(catalogQueries)
            .values({
                source: 'keepa',
                marketplaceId: market,
                normalizedTerm: 'fishing',
                displayTerm: 'fishing',
            })
            .returning();
        const [operation] = await db
            .insert(operations)
            .values({ type: 'catalogSearch', targetKey: query.id, input: {} })
            .returning();
        const [run] = await db
            .insert(catalogSearchRuns)
            .values({
                queryId: query.id,
                operationId: operation.id,
                sourceStartedAt: new Date(),
                sourceCompletedAt: new Date(),
                trigger: 'requested',
                resultCount: 1,
                normalizerVersion: 1,
            })
            .returning();
        await db
            .insert(catalogSearchResults)
            .values({ runId: run.id, productId: product.id, sourcePosition: 1 });
        await db.insert(keywordProducts).values({
            queryId: query.id,
            productId: product.id,
            firstObservedAt: new Date(),
            lastObservedAt: new Date(),
        });
        expect((await search({ term: 'fishing' })).items.map(item => item.asin)).toEqual([
            'B000000001',
        ]);
        expect((await search({ term: 'fishing', textFields: 'title' })).items).toHaveLength(0);
        expect((await search({ term: 'fishing', salesRank: { max: 1 } })).items).toHaveLength(0);
    });
});

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [product] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            title: 'Fishing shirt',
            isMerchListing: true,
            rootCategoryBsr: 100,
            ...extra,
        })
        .returning();
    return product;
};
