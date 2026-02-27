import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { keepaHistoryRefreshQueue } from '@/db/schema.js';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy.js';

export const KEEPA_SCHEDULED_REFRESH_SCAN_LIMIT = 500;

export type KeepaScheduledRefreshCandidate = {
    marketplaceId: string;
    asin: string;
};

export const getKeepaScheduledRefreshCandidates = async ({
    limit = KEEPA_SCHEDULED_REFRESH_SCAN_LIMIT,
}: {
    limit?: number;
} = {}): Promise<KeepaScheduledRefreshCandidate[]> => {
    if (limit <= 0) {
        return [];
    }

    const now = Date.now();
    const dailyThreshold = new Date(now - KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS);
    const weeklyThreshold = new Date(now - KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS);

    const rows = await db.execute<KeepaScheduledRefreshCandidate>(sql`
        SELECT
            p.marketplace_id AS "marketplaceId",
            p.asin AS "asin"
        FROM products p
        WHERE p.is_merch_listing = true
          AND p.root_category_bsr IS NOT NULL
          AND (
            (
                p.root_category_bsr < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                AND NOT EXISTS (
                    SELECT 1
                    FROM product_history_imports phi
                    WHERE phi.marketplace_id = p.marketplace_id
                      AND phi.asin = p.asin
                      AND phi.source = 'keepa'
                      AND phi.status = 'success'
                      AND phi.created_at > ${dailyThreshold}
                )
            )
            OR
            (
                p.root_category_bsr >= ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                AND p.root_category_bsr < ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}
                AND NOT EXISTS (
                    SELECT 1
                    FROM product_history_imports phi
                    WHERE phi.marketplace_id = p.marketplace_id
                      AND phi.asin = p.asin
                      AND phi.source = 'keepa'
                      AND phi.status = 'success'
                      AND phi.created_at > ${weeklyThreshold}
                )
            )
          )
        ORDER BY p.root_category_bsr ASC, p.created_at ASC
        LIMIT ${limit}
    `);

    return rows;
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
            candidates.map((candidate) => ({
                marketplaceId: candidate.marketplaceId,
                asin: candidate.asin,
                nextAttemptAt: now,
                lastError: null,
                updatedAt: now,
            }))
        )
        .onConflictDoNothing({
            target: [
                keepaHistoryRefreshQueue.marketplaceId,
                keepaHistoryRefreshQueue.asin,
            ],
        })
        .returning({
            id: keepaHistoryRefreshQueue.id,
        });

    return rows.length;
};
