import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchResults, catalogSearchRuns, products } from '@/db/schema';
import { getProducts, type ProductFetchPolicy } from '@/services/product-retrieval';
import { mapCatalogRunMetadata } from './catalog-query-read-model';

const CATALOG_SOURCE = 'keepa' as const;

export interface CatalogSearchRunReadOptions {
    fetchPolicy?: ProductFetchPolicy;
    signal?: AbortSignal;
    timeoutMs?: number;
    retrieveProducts?: typeof getProducts;
}

export const listCatalogSearchRuns = async ({
    queryId,
    limit,
    cursor,
}: {
    queryId: string;
    limit: number;
    cursor?: string;
}) => {
    const [query] = await db
        .select({ id: catalogQueries.id })
        .from(catalogQueries)
        .where(eq(catalogQueries.id, queryId))
        .limit(1);
    if (!query) {
        return null;
    }

    const cursorRun = cursor
        ? (
              await db
                  .select({
                      id: catalogSearchRuns.id,
                      sourceCompletedAt: catalogSearchRuns.sourceCompletedAt,
                  })
                  .from(catalogSearchRuns)
                  .where(
                      and(eq(catalogSearchRuns.id, cursor), eq(catalogSearchRuns.queryId, queryId))
                  )
                  .limit(1)
          )[0]
        : null;
    if (cursor && !cursorRun) {
        return null;
    }

    const cursorCondition = cursorRun
        ? or(
              lt(catalogSearchRuns.sourceCompletedAt, cursorRun.sourceCompletedAt),
              and(
                  eq(catalogSearchRuns.sourceCompletedAt, cursorRun.sourceCompletedAt),
                  lt(catalogSearchRuns.id, cursorRun.id)
              )
          )
        : undefined;
    const rows = await db
        .select()
        .from(catalogSearchRuns)
        .where(
            cursorCondition
                ? and(eq(catalogSearchRuns.queryId, queryId), cursorCondition)
                : eq(catalogSearchRuns.queryId, queryId)
        )
        .orderBy(desc(catalogSearchRuns.sourceCompletedAt), desc(catalogSearchRuns.id))
        .limit(limit + 1);
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit).map(mapCatalogRunMetadata);

    return {
        items,
        nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
    };
};

export const getCatalogSearchRun = async (
    runId: string,
    options: CatalogSearchRunReadOptions = {}
) => {
    const retrieveProducts = options.retrieveProducts ?? getProducts;
    const rows = await db
        .select({
            run: catalogSearchRuns,
            query: catalogQueries,
            result: catalogSearchResults,
            product: products,
        })
        .from(catalogSearchRuns)
        .innerJoin(catalogQueries, eq(catalogQueries.id, catalogSearchRuns.queryId))
        .leftJoin(catalogSearchResults, eq(catalogSearchResults.runId, catalogSearchRuns.id))
        .leftJoin(products, eq(products.id, catalogSearchResults.productId))
        .where(eq(catalogSearchRuns.id, runId))
        .orderBy(catalogSearchResults.sourcePosition);
    const first = rows[0];
    if (!first) {
        return null;
    }

    const identities = rows.flatMap(row =>
        row.product ? [{ marketplaceId: row.product.marketplaceId, asin: row.product.asin }] : []
    );
    const productReads = await retrieveProducts({
        products: identities,
        fetchPolicy: options.fetchPolicy ?? 'background',
        signal: options.signal,
        timeoutMs: options.timeoutMs,
    });
    const productReadsByKey = new Map(
        productReads.map(read => [`${read.identity.marketplaceId}:${read.identity.asin}`, read])
    );

    return {
        ...mapCatalogRunMetadata(first.run),
        query: {
            id: first.query.id,
            source: CATALOG_SOURCE,
            marketplaceId: first.query.marketplaceId,
            normalizedTerm: first.query.normalizedTerm,
            displayTerm: first.query.displayTerm,
            page: first.query.page,
        },
        results: rows.flatMap(row => {
            if (!row.result) {
                return [];
            }

            return [
                {
                    productId: row.result.productId,
                    position: {
                        source: CATALOG_SOURCE,
                        value: row.result.sourcePosition,
                    },
                    observed: mapObservation(row.result),
                    currentProduct: row.product
                        ? (productReadsByKey.get(`${row.product.marketplaceId}:${row.product.asin}`)
                              ?.product ?? null)
                        : null,
                    currentAmazonListingStatus: row.product
                        ? (productReadsByKey.get(`${row.product.marketplaceId}:${row.product.asin}`)
                              ?.amazonListingStatus ?? 'deleted')
                        : 'deleted',
                },
            ];
        }),
    };
};

const mapObservation = (result: typeof catalogSearchResults.$inferSelect) => ({
    rootCategoryBsr: result.observedRootCategoryBsr,
    newPriceAmountMinor: result.observedNewPrice,
    currencyCode: 'USD' as const,
    monthlySold: result.observedMonthlySold,
    averageRootCategoryBsr30: result.observedBsrAverage30,
    averageRootCategoryBsr90: result.observedBsrAverage90,
    salesRankDrops: {
        days30: result.observedSalesRankDrops30,
        days90: result.observedSalesRankDrops90,
        days180: result.observedSalesRankDrops180,
        days365: result.observedSalesRankDrops365,
    },
    sourceUpdatedAt: result.observedSourceUpdatedAt?.toISOString() ?? null,
});
