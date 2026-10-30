import { count, lte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaCapacityState } from '@/db/keepa-capacity-schema';
import { keepaHistoryRefreshQueue } from '@/db/schema';
import { KEEPA_DISPATCH_HOLD_MS } from '@/services/keepa-history-refresh';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_REFRESH_QUEUE_FALLBACK_TARGET,
    KEEPA_REFRESH_QUEUE_TARGET_MINUTES,
    KEEPA_SPARE_REFRESH_MIN_INTERVAL_MS,
    KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy';

export type KeepaScheduledRefreshCandidate = {
    marketplaceId: string;
    asin: string;
};

/** Admitted Merch Products whose BSR tier makes them due, best BSR first. */
export const getKeepaScheduledRefreshCandidates = async ({
    limit,
}: {
    limit: number;
}): Promise<KeepaScheduledRefreshCandidate[]> => {
    if (limit <= 0) {
        return [];
    }

    const rows = await db.execute<KeepaScheduledRefreshCandidate>(sql`
        SELECT
            p.marketplace_id AS "marketplaceId",
            p.asin AS "asin"
        FROM products p
        WHERE p.is_merch_listing = true
          AND p.amazon_listing_status = 'active'
          AND p.history_admission_state = 'admitted'
          AND p.root_category_bsr IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM keepa_history_refresh_queue q
            WHERE q.marketplace_id = p.marketplace_id
              AND q.asin = p.asin
          )
          AND (
            (
                p.root_category_bsr < ${KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD}
                AND (
                    p.keepa_fetched_at IS NULL
                    OR p.keepa_fetched_at <= now() - (
                        ${KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS} * interval '1 millisecond'
                    )
                )
            )
            OR
            (
                p.root_category_bsr >= ${KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD}
                AND p.root_category_bsr < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                AND (
                    p.keepa_fetched_at IS NULL
                    OR p.keepa_fetched_at <= now() - (
                        ${KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS} * interval '1 millisecond'
                    )
                )
            )
            OR
            (
                p.root_category_bsr >= ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                AND p.root_category_bsr < ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}
                AND (
                    p.keepa_fetched_at IS NULL
                    OR p.keepa_fetched_at <= now() - (
                        ${KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS} * interval '1 millisecond'
                    )
                )
            )
          )
        ORDER BY p.root_category_bsr ASC, p.created_at ASC
        LIMIT ${limit}
    `);

    return rows;
};

/**
 * Admitted, active Merch Products with a BSR in any tier that were never fetched or not in the last
 * day, best BSR first. They take whatever room tier-due work leaves, so spare refill is spent.
 */
export const getKeepaSpareRefreshCandidates = async ({
    limit,
    now = new Date(),
}: {
    limit: number;
    now?: Date;
}): Promise<KeepaScheduledRefreshCandidate[]> => {
    if (limit <= 0) {
        return [];
    }
    const staleBefore = new Date(now.getTime() - KEEPA_SPARE_REFRESH_MIN_INTERVAL_MS);
    return await db.execute<KeepaScheduledRefreshCandidate>(sql`
        SELECT p.marketplace_id AS "marketplaceId", p.asin AS "asin"
        FROM products p
        WHERE p.is_merch_listing = true
          AND p.amazon_listing_status = 'active'
          AND p.history_admission_state = 'admitted'
          AND p.root_category_bsr IS NOT NULL
          AND (p.keepa_fetched_at IS NULL OR p.keepa_fetched_at <= ${staleBefore.toISOString()}::timestamp)
          AND NOT EXISTS (
            SELECT 1 FROM keepa_history_refresh_queue q
            WHERE q.marketplace_id = p.marketplace_id AND q.asin = p.asin
          )
        ORDER BY p.root_category_bsr ASC, p.created_at ASC
        LIMIT ${limit}
    `);
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
