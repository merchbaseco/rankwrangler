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
            salesRankAverages: { last30Days: 270_000, last90Days: null },
            salesRankDrops: { last30Days: 12 },
            boughtInPastMonth: 50,
            keywordPosition: null,
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
            excludeWords: ['bass'],
            salesRank: { max: 50 },
            firstAvailableAt: { after: '2026-07-01' },
            limit: 1,
        });
        expect(page.items.map(item => item.asin)).toEqual(['B000000002']);
        expect(page.nextCursor).toBeNull();
        expect((await search({ term: 'fish' })).items).toHaveLength(0);
    });

    it('combines facet alternatives and filters by Merch status', async () => {
        const fishing = await insertProduct('B000000001');
        const nurse = await insertProduct('B000000002', { isMerchListing: false });
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
        const both = await search({ facets, isMerchListing: 'all' });
        expect(both.items).toHaveLength(2);
        expect(both.items.find(item => item.asin === 'B000000001')?.facets).toEqual([
            { facet: 'hobby', name: 'fishing' },
        ]);
        expect(
            (await search({ facets, isMerchListing: false })).items.map(item => item.asin)
        ).toEqual(['B000000002']);
        expect((await search({ facets })).items.map(item => item.asin)).toEqual(['B000000001']);
        expect((await search({ facets, salesRank: { min: 500 } })).items).toHaveLength(0);
    });

    it('matches titles only: bullet, brand and keyword-member matches stay out', async () => {
        await insertProduct('B000000001', { title: 'Bruh thanksgiving shirt' });
        await insertProduct('B000000002', {
            title: 'Glowing era shirt',
            bullet1: 'Great gift for bruh thanksgiving, Christmas and Halloween',
        });
        await insertProduct('B000000003', { title: 'Fall shirt', brand: 'Bruh Thanksgiving Co' });
        const member = await insertProduct('B000000004', { title: 'Weekend lake club' });
        await insertHeadRun('bruh thanksgiving', [[member.id, 1]]);

        const result = await search({ term: 'Bruh   Thanksgiving' });

        expect(result.items.map(item => item.asin)).toEqual(['B000000001']);
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

const insertHeadRun = async (
    term: string,
    positions: ReadonlyArray<readonly [string, number]>,
    createdAt = new Date()
) => {
    const [query] = await db
        .insert(catalogQueries)
        .values({ source: 'keepa', marketplaceId: market, normalizedTerm: term, displayTerm: term })
        .onConflictDoUpdate({
            target: [
                catalogQueries.source,
                catalogQueries.marketplaceId,
                catalogQueries.normalizedTerm,
            ],
            set: { displayTerm: term },
        })
        .returning();
    const [operation] = await db
        .insert(operations)
        .values({
            type: 'catalogSearch',
            targetKey: `${query.id}:${createdAt.getTime()}`,
            input: {},
        })
        .returning();
    const [run] = await db
        .insert(catalogSearchRuns)
        .values({
            queryId: query.id,
            operationId: operation.id,
            sourceStartedAt: createdAt,
            sourceCompletedAt: createdAt,
            createdAt,
            trigger: 'requested',
            resultCount: positions.length,
            normalizerVersion: 1,
        })
        .returning();
    if (positions.length) {
        await db.insert(catalogSearchResults).values(
            positions.map(([productId, sourcePosition]) => ({
                runId: run.id,
                productId,
                sourcePosition,
            }))
        );
    }
};
