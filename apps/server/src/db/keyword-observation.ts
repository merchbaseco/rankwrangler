import { getKeepaAdmissionCapacity } from '@/services/keepa-capacity';
import { KEYWORD_DAY_MS } from '@/services/keyword-collection-policy';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { catalogQueries, catalogSearchResults, catalogSearchRuns } from './catalog-search-schema';
import type { db } from './index';
import { products } from './product-schema';
import { keywordProducts } from './keyword-collection-schema';
import { nextKeywordObservation, type KeywordTier } from '@/services/keyword-collection-policy';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const acceptKeywordObservation = async (
    transaction: Transaction,
    input: {
        queryId: string;
        runId: string;
        page: number;
        completedAt: Date;
        resultCount: number;
        productIds: string[];
    }
) => {
    const [query] = await transaction
        .select()
        .from(catalogQueries)
        .where(eq(catalogQueries.id, input.queryId));
    if (!query) throw new Error('Keyword disappeared during observation.');
    const merchRows = input.productIds.length
        ? await transaction
              .select({ id: products.id })
              .from(products)
              .where(and(inArray(products.id, input.productIds), eq(products.isMerchListing, true)))
        : [];
    const merchProductIds = merchRows.map(row => row.id);

    if (input.productIds.length) {
        await transaction
            .insert(keywordProducts)
            .values(
                input.productIds.map(productId => ({
                    queryId: input.queryId,
                    productId,
                    firstObservedAt: input.completedAt,
                    lastObservedAt: input.completedAt,
                }))
            )
            .onConflictDoNothing()
            .returning({ id: keywordProducts.productId });
        await transaction
            .update(keywordProducts)
            .set({ lastObservedAt: input.completedAt })
            .where(
                and(
                    eq(keywordProducts.queryId, input.queryId),
                    inArray(keywordProducts.productId, input.productIds)
                )
            );
    }
    if (input.page === 0) {
        const [previous] = await transaction
            .select({ id: catalogSearchRuns.id })
            .from(catalogSearchRuns)
            .where(
                and(
                    eq(catalogSearchRuns.queryId, input.queryId),
                    eq(catalogSearchRuns.page, 0),
                    sql`${catalogSearchRuns.id} <> ${input.runId}`
                )
            )
            .orderBy(desc(catalogSearchRuns.sourceCompletedAt))
            .limit(1);
        const previousMerchIds = previous
            ? await transaction
                  .select({ id: keywordProducts.productId })
                  .from(keywordProducts)
                  .innerJoin(
                      catalogSearchResults,
                      and(
                          eq(catalogSearchResults.productId, keywordProducts.productId),
                          eq(catalogSearchResults.runId, previous.id)
                      )
                  )
                  .innerJoin(
                      products,
                      and(
                          eq(products.id, keywordProducts.productId),
                          eq(products.isMerchListing, true)
                      )
                  )
                  .where(eq(keywordProducts.queryId, input.queryId))
            : [];
        const schedule = nextKeywordObservation({
            tier: query.tier as KeywordTier,
            intervalDays: query.intervalDays,
            previousMerchIds: previousMerchIds.map(row => row.id),
            currentMerchIds: merchProductIds,
            emptyCount: query.consecutiveEmpty,
            resultCount: input.resultCount,
            now: input.completedAt,
        });
        if (query.tier !== 'stored' && schedule.intervalDays < query.intervalDays) {
            const capacity = await getKeepaAdmissionCapacity(transaction);
            const [load] = capacity
                ? await transaction
                      .select({
                          daily: sql<number>`coalesce(sum(${capacity.headCost}::numeric / greatest(${catalogQueries.intervalDays}, 1)), 0)::float`,
                      })
                      .from(catalogQueries)
                      .where(sql`${catalogQueries.tier} <> 'stored'`)
                : [];
            const extra = capacity
                ? capacity.headCost / schedule.intervalDays - capacity.headCost / query.intervalDays
                : Infinity;
            if (!capacity || (load?.daily ?? 0) + extra > capacity.refillRate * 1440 * 0.2 * 0.9) {
                schedule.intervalDays = query.intervalDays;
                schedule.nextDueAt = new Date(
                    input.completedAt.getTime() +
                        query.intervalDays * KEYWORD_DAY_MS * (0.9 + Math.random() * 0.2)
                );
            }
        }
        await transaction
            .update(catalogQueries)
            .set({
                ...schedule,
                latestSuccessfulRunAt: input.completedAt,
                failureCount: 0,
                ...(query.demotionObservedAt ? { demotionCount: query.demotionCount + 1 } : {}),
                nextRefreshAttemptAt: null,
                ...(merchProductIds.length ? { merchObservedAt: input.completedAt } : {}),
                updatedAt: input.completedAt,
            })
            .where(eq(catalogQueries.id, input.queryId));
    }
};
