import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { productSearchInput } from '@/api/product-search-input';
import { db } from '@/db/index';
import { searchStoredProducts } from '@/db/product-search';
import { MERCH_ROOT_CATEGORY_ID } from '@/db/sales-curve-observations';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    products,
} from '@/db/schema';

const market = 'ATVPDKIKX0DER';
const search = (input: Parameters<typeof productSearchInput.parse>[0]) =>
    searchStoredProducts(productSearchInput.parse(input));

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'stored Product search ranking',
    () => {
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

        it('orders relevance by the newest head run position, then title match, paging by cursor', async () => {
            const placedThird = await insertProduct('B000000001', {
                title: 'Bruh thanksgiving tee',
            });
            const unplaced = await insertProduct('B000000002', {
                title: 'Bruh thanksgiving bruh thanksgiving shirt',
            });
            const placedFirst = await insertProduct('B000000003', { title: 'Thanksgiving bruh' });
            await insertHeadRun('bruh thanksgiving', [[unplaced.id, 1]], new Date('2026-01-01'));
            await insertHeadRun('bruh thanksgiving', [
                [placedFirst.id, 1],
                [placedThird.id, 3],
            ]);

            const items: Array<{ asin: string; keywordPosition: number | null }> = [];
            let cursor: string | null = null;
            do {
                const page = await search({
                    term: 'bruh thanksgiving',
                    sort: 'relevance',
                    limit: 1,
                    cursor,
                });
                items.push(
                    ...page.items.map(({ asin, keywordPosition }) => ({ asin, keywordPosition }))
                );
                cursor = page.nextCursor;
            } while (cursor);

            expect(items).toEqual([
                { asin: 'B000000003', keywordPosition: 1 },
                { asin: 'B000000001', keywordPosition: 3 },
                { asin: 'B000000002', keywordPosition: null },
            ]);
        });

        it('ranks estimated monthly sales above sparse badges and pages without gaps or repeats', async () => {
            // 100 · (300,000 / rank): rank 3,000 → 10,000; 60,000 → 500; 600,000 → 50; 1M → 30.
            const curve = {
                referenceBsr: 300_000,
                intercept: Math.log(100),
                headSlope: -1,
                tailSlope: -1,
            };
            await insertProduct('B0STRONG01', { rootCategoryBsr: 3_000 });
            // Seasonal surges: the current rank leads, not the lagging 30-day average.
            await insertProduct('B0AVERAGE1', {
                rootCategoryBsr: 60_000,
                keepaBsrAverage30: 900_000,
            });
            await insertProduct('B0AVERAGE2', {
                rootCategoryBsr: 60_000,
                keepaBsrAverage30: 900_000,
            });
            // Outside Clothing the curve says nothing, whatever the rank.
            await insertProduct('B0PHONECAS', { rootCategoryBsr: 1_000, rootCategoryId: 2_335_752_011 });
            await insertProduct('B0BADGE200', { rootCategoryBsr: null, keepaMonthlySold: 200 });
            await insertProduct('B0BADGE100', { rootCategoryBsr: 600_000, keepaMonthlySold: 100 });
            await insertProduct('B0BADGE050', { rootCategoryBsr: 1_000_000, keepaMonthlySold: 50 });
            await insertProduct('B0NOTHING1', { rootCategoryBsr: null });

            const items: Array<{ asin: string; estimatedMonthlySales: number | null }> = [];
            let cursor: string | null = null;
            do {
                const page = await searchStoredProducts(
                    productSearchInput.parse({ limit: 2, cursor }),
                    { curve }
                );
                items.push(
                    ...page.items.map(({ asin, estimatedMonthlySales }) => ({
                        asin,
                        estimatedMonthlySales,
                    }))
                );
                cursor = page.nextCursor;
            } while (cursor);

            expect(items[0]).toEqual({ asin: 'B0STRONG01', estimatedMonthlySales: 10_000 });
            expect(new Set(items.slice(1, 3).map(item => item.asin))).toEqual(
                new Set(['B0AVERAGE1', 'B0AVERAGE2'])
            );
            expect(items.slice(1, 3).map(item => item.estimatedMonthlySales)).toEqual([500, 500]);
            expect(items.slice(3, 6)).toEqual([
                { asin: 'B0BADGE200', estimatedMonthlySales: null },
                { asin: 'B0BADGE100', estimatedMonthlySales: 50 },
                { asin: 'B0BADGE050', estimatedMonthlySales: 30 },
            ]);
            expect(new Set(items.slice(6).map(item => item.asin))).toEqual(
                new Set(['B0PHONECAS', 'B0NOTHING1'])
            );
            expect(items.slice(6).map(item => item.estimatedMonthlySales)).toEqual([null, null]);
        });

        it('falls back to the badge when no curve is fitted', async () => {
            await insertProduct('B000000001', { rootCategoryBsr: 10, keepaMonthlySold: null });
            await insertProduct('B000000002', { rootCategoryBsr: 900_000, keepaMonthlySold: 50 });

            const page = await searchStoredProducts(productSearchInput.parse({}), { curve: null });

            expect(
                page.items.map(({ asin, estimatedMonthlySales }) => [asin, estimatedMonthlySales])
            ).toEqual([
                ['B000000002', null],
                ['B000000001', null],
            ]);
        });
    }
);

const insertProduct = async (asin: string, extra: Partial<typeof products.$inferInsert> = {}) => {
    const [product] = await db
        .insert(products)
        .values({
            marketplaceId: market,
            asin,
            title: 'Fishing shirt',
            isMerchListing: true,
            rootCategoryId: MERCH_ROOT_CATEGORY_ID,
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
