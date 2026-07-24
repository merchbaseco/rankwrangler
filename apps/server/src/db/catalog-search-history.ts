import { and, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchResults, catalogSearchRuns, products } from '@/db/schema';
import { mapStoredProductInfo } from './product/product-info-mapper';

const CATALOG_SOURCE = 'keepa' as const;

export const getCatalogQuery = async (normalizedTerm: string) => {
    const [query] = await db
        .select()
        .from(catalogQueries)
        .where(
            and(
                eq(catalogQueries.source, CATALOG_SOURCE),
                eq(catalogQueries.marketplaceId, 'ATVPDKIKX0DER'),
                eq(catalogQueries.normalizedTerm, normalizedTerm),
                eq(catalogQueries.page, 0)
            )
        )
        .limit(1);
    if (!query) {
        return null;
    }

    const [latestRun] = await db
        .select()
        .from(catalogSearchRuns)
        .where(eq(catalogSearchRuns.queryId, query.id))
        .orderBy(desc(catalogSearchRuns.sourceCompletedAt), desc(catalogSearchRuns.id))
        .limit(1);

    return {
        id: query.id,
        source: CATALOG_SOURCE,
        marketplaceId: query.marketplaceId,
        normalizedTerm: query.normalizedTerm,
        displayTerm: query.displayTerm,
        page: query.page,
        tracking: { enabled: false },
        latestRun: latestRun ? mapRunMetadata(latestRun) : null,
    };
};

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
    const items = rows.slice(0, limit).map(mapRunMetadata);

    return {
        items,
        nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
    };
};

export const getCatalogSearchRun = async (runId: string) => {
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

    return {
        ...mapRunMetadata(first.run),
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
                    currentProduct: row.product ? mapStoredProductInfo(row.product) : null,
                },
            ];
        }),
    };
};

const mapRunMetadata = (run: typeof catalogSearchRuns.$inferSelect) => ({
    id: run.id,
    sourceStartedAt: run.sourceStartedAt.toISOString(),
    sourceCompletedAt: run.sourceCompletedAt.toISOString(),
    resultCount: run.resultCount,
    normalizerVersion: run.normalizerVersion,
    createdAt: run.createdAt.toISOString(),
});

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
