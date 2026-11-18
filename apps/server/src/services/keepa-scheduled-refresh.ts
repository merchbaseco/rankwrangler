import { count, lte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaCapacityState } from '@/db/keepa-capacity-schema';
import { keepaHistoryRefreshQueue, products } from '@/db/schema';
import { keepaRefreshDueAt, keepaRefreshTracked } from '@/db/product-refresh-due';
import { KEEPA_DISPATCH_HOLD_MS } from '@/services/keepa-history-refresh';
import {
    KEEPA_REFRESH_QUEUE_FALLBACK_TARGET,
    KEEPA_REFRESH_QUEUE_TARGET_MINUTES,
} from '@/services/keepa-refresh-policy';

export type KeepaScheduledRefreshCandidate = {
    marketplaceId: string;
    asin: string;
};

/**
 * Admitted Merch Products whose BSR tier makes them due, best BSR first. The due-at expression
 * index (`products_keepa_refresh_due_idx`, see product-refresh-due) yields only due rows, so fresh
 * Products are never read; the sort covers the due set alone, a few dozen rows between runs.
 */
export const getKeepaScheduledRefreshCandidates = async ({
    limit,
    now = new Date(),
}: {
    limit: number;
    now?: Date;
}): Promise<KeepaScheduledRefreshCandidate[]> => {
    if (limit <= 0) {
        return [];
    }

    // Materialized so the due set is read from its index first; ordering the whole query by BSR
    // would invite a walk of the BSR range filtering out every fresh Product.
    return await db.execute<KeepaScheduledRefreshCandidate>(sql`
        with due as materialized (
            select ${products.marketplaceId} "marketplaceId", ${products.asin} asin,
                ${products.rootCategoryBsr} bsr, ${products.createdAt} created_at
            from ${products}
            where ${keepaRefreshTracked(products)}
                and ${keepaRefreshDueAt(products)} <= ${now.toISOString()}::timestamp
        )
        select "marketplaceId", asin from due
        where not exists (
            select 1 from ${keepaHistoryRefreshQueue} q
            where q.marketplace_id = due."marketplaceId" and q.asin = due.asin
        )
        order by bsr, created_at
        limit ${limit}`);
};

/** How much work the scheduled top-up keeps queued: about half an hour of the plan's refill. */
export const getKeepaRefreshQueueTarget = async () => {
    const [state] = await db
        .select({ refillRate: keepaCapacityState.refillRate })
        .from(keepaCapacityState);
    return state && state.refillRate > 0
        ? state.refillRate * KEEPA_REFRESH_QUEUE_TARGET_MINUTES
        : KEEPA_REFRESH_QUEUE_FALLBACK_TARGET;
};

// Counts work that is due or in flight. Items backing off after a failure wait up to a day and must
// not make the queue look full, or a run of failures would starve the top-up.
export const countQueuedKeepaRefreshes = async (now = new Date()) => {
    const [row] = await db
        .select({ queued: count() })
        .from(keepaHistoryRefreshQueue)
        .where(
            lte(
                keepaHistoryRefreshQueue.nextAttemptAt,
                new Date(now.getTime() + KEEPA_DISPATCH_HOLD_MS)
            )
        );
    return row?.queued ?? 0;
};

export const enqueueKeepaScheduledRefreshCandidates = async (
    candidates: KeepaScheduledRefreshCandidate[]
) => {
    if (candidates.length === 0) {
        return 0;
    }

    const now = new Date();
    const rows = await db
        .insert(keepaHistoryRefreshQueue)
        .values(
            candidates.map(candidate => ({
                marketplaceId: candidate.marketplaceId,
                asin: candidate.asin,
                nextAttemptAt: now,
                lastError: null,
                updatedAt: now,
            }))
        )
        .onConflictDoNothing({
            target: [keepaHistoryRefreshQueue.marketplaceId, keepaHistoryRefreshQueue.asin],
        })
        .returning({
            id: keepaHistoryRefreshQueue.id,
        });

    return rows.length;
};
