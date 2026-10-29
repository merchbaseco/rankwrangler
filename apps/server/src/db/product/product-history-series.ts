import { and, eq, type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { productHistorySeries, products } from '@/db/schema';
import type { KeepaHistorySeries } from '@/services/keepa-history-series';

type Executor = Pick<typeof db, 'insert'>;

/** Which side keeps its value when the stored and incoming series share a Keepa minute. */
export type SeriesMergePrecedence = 'incoming' | 'stored';

/**
 * Upserts one Product's series, one statement for every metric. An existing series is merged with
 * the incoming one rather than replaced, matching point-level upserts: a fetch with a shorter
 * window never erases older history. The merge runs inside `ON CONFLICT DO UPDATE`, which holds
 * the row lock, so concurrent writers cannot lose each other's points.
 */
export const writeProductHistorySeries = async (
    executor: Executor,
    productId: string,
    series: readonly KeepaHistorySeries[],
    { source, prefer }: { source: string; prefer: SeriesMergePrecedence }
) => {
    if (series.length === 0) return;
    await executor
        .insert(productHistorySeries)
        .values(
            series.map(entry => ({
                productId,
                source,
                metric: entry.metric,
                categoryId: entry.categoryId,
                keepaMinutes: [...entry.keepaMinutes],
                keepaValues: [...entry.values],
            }))
        )
        .onConflictDoUpdate({
            target: [
                productHistorySeries.productId,
                productHistorySeries.source,
                productHistorySeries.metric,
                productHistorySeries.categoryId,
            ],
            set: mergeSeriesOnConflict(prefer),
        });
};

/** The `ON CONFLICT DO UPDATE` assignments that merge `excluded` into the stored series. */
export const mergeSeriesOnConflict = (prefer: SeriesMergePrecedence) => ({
    keepaMinutes: mergedSeriesColumn('m', prefer),
    keepaValues: mergedSeriesColumn('v', prefer),
    updatedAt: sql`now()`,
});

/** A Product's stored series for one metric, every category unless one is named. */
export const readProductHistorySeries = async ({
    marketplaceId,
    asin,
    source,
    metric,
    categoryId,
}: {
    marketplaceId: string;
    asin: string;
    source: string;
    metric: string;
    categoryId?: number;
}): Promise<KeepaHistorySeries[]> => {
    const conditions: SQL[] = [
        eq(products.marketplaceId, marketplaceId),
        eq(products.asin, asin),
        eq(productHistorySeries.source, source),
        eq(productHistorySeries.metric, metric),
    ];
    if (typeof categoryId === 'number') {
        conditions.push(eq(productHistorySeries.categoryId, categoryId));
    }

    const rows = await db
        .select({
            metric: productHistorySeries.metric,
            categoryId: productHistorySeries.categoryId,
            keepaMinutes: productHistorySeries.keepaMinutes,
            values: productHistorySeries.keepaValues,
        })
        .from(productHistorySeries)
        .innerJoin(products, eq(products.id, productHistorySeries.productId))
        .where(and(...conditions));
    return rows;
};

/** Stored point counts per metric for one Product, summed across categories. */
export const countProductHistoryPoints = async (productId: string, source: string) => {
    const rows = await db
        .select({
            metric: productHistorySeries.metric,
            count: sql<number>`sum(cardinality(${productHistorySeries.keepaMinutes}))::int`,
        })
        .from(productHistorySeries)
        .where(
            and(
                eq(productHistorySeries.productId, productId),
                eq(productHistorySeries.source, source)
            )
        )
        .groupBy(productHistorySeries.metric);
    return Object.fromEntries(rows.map(row => [row.metric, row.count])) as Record<string, number>;
};

/**
 * One column of the merged series: the union of stored and incoming points by Keepa minute, the
 * preferred side winning a shared minute, ordered by minute. Both columns order the same distinct
 * set the same way, so the arrays stay parallel.
 */
const mergedSeriesColumn = (column: 'm' | 'v', prefer: SeriesMergePrecedence) => {
    const incomingRank = prefer === 'incoming' ? 0 : 1;
    return sql.raw(`(
        select array_agg(merged.${column} order by merged.m)
        from (
            select distinct on (candidate.m) candidate.m, candidate.v
            from (
                select incoming.m, incoming.v, ${incomingRank} as rank
                from unnest(excluded.keepa_minutes, excluded.keepa_values) as incoming(m, v)
                union all
                select stored.m, stored.v, ${1 - incomingRank} as rank
                from unnest(
                    product_history_series.keepa_minutes,
                    product_history_series.keepa_values
                ) as stored(m, v)
            ) as candidate
            order by candidate.m, candidate.rank
        ) as merged
    )`);
};
