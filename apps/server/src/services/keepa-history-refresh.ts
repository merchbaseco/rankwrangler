import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { env } from '@/config/env';
import { db } from '@/db/index';
import { keepaHistoryRefreshQueue, productHistoryImports } from '@/db/schema';
import {
    getProductHistoryEligibilitySnapshot,
    getAutomaticHistoryDecision,
} from '@/services/product-history-eligibility';
import { createKeepaProvider } from '@/services/providers/keepa/keepa-provider';
import { getKeepaFailureRetryDelayMs } from '@/services/keepa-refresh-policy';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const KEEPA_INITIAL_HISTORY_DAYS = 3650;
const KEEPA_MIN_INCREMENTAL_HISTORY_DAYS = 30;
const KEEPA_INCREMENTAL_BUFFER_DAYS = 7;
const KEEPA_DISPATCH_HOLD_MS = 5 * 60 * 1000;
const KEEPA_MIN_TOKEN_BUFFER = 0;
// A history fetch measures one token. The durable reservation enforces the real budget and the
// live reserve, so dispatch only needs to keep up with the refill: one minute's worth per run.
const KEEPA_TOKENS_PER_HISTORY_FETCH = 1;
const KEEPA_DEFAULT_REFILL_PER_MINUTE = 20;
const keepaProvider = createKeepaProvider();

export type KeepaHistoryRefreshQueueItem = {
    id: string;
    marketplaceId: string;
    asin: string;
    attemptCount: number;
    nextAttemptAt: Date;
    createdAt: Date;
};

export const enqueueKeepaHistoryRefreshForAsin = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    if (!env.RANKWRANGLER_KEEPA_API_KEY) {
        return {
            enqueued: false,
            reason: 'keepa_not_configured',
        } as const;
    }

    const product = await getProductHistoryEligibilitySnapshot({ marketplaceId, asin });
    if (!product) {
        return {
            enqueued: false,
            reason: 'product_missing',
        } as const;
    }

    const refreshDecision = getAutomaticHistoryDecision(product);
    if (refreshDecision.reason === 'not_eligible' || refreshDecision.reason === 'not_admitted') {
        return {
            enqueued: false,
            reason: 'not_eligible',
        } as const;
    }

    if (!refreshDecision.shouldRefresh) {
        return {
            enqueued: false,
            reason: 'fresh_product',
        } as const;
    }

    const now = new Date();

    await db
        .insert(keepaHistoryRefreshQueue)
        .values({
            marketplaceId,
            asin,
            nextAttemptAt: now,
            lastError: null,
            updatedAt: now,
        })
        .onConflictDoUpdate({
            target: [keepaHistoryRefreshQueue.marketplaceId, keepaHistoryRefreshQueue.asin],
            set: {
                nextAttemptAt: sql`LEAST(${keepaHistoryRefreshQueue.nextAttemptAt}, excluded.next_attempt_at)`,
                updatedAt: sql`now()`,
            },
        });

    return {
        enqueued: true,
        reason: 'queued',
    } as const;
};

export const getKeepaHistoryRefreshQueueBatchSize = () => {
    const tokenState = keepaProvider.getRuntimeTokenState();
    const tokensLeft = tokenState.tokensLeft;

    if (typeof tokensLeft !== 'number') {
        return 1;
    }

    const tokensAvailableForDispatch = Math.max(0, tokensLeft - KEEPA_MIN_TOKEN_BUFFER);
    const tokenConstrainedBatchSize = Math.trunc(
        tokensAvailableForDispatch / KEEPA_TOKENS_PER_HISTORY_FETCH
    );

    const refillPerMinute = tokenState.refillRate ?? KEEPA_DEFAULT_REFILL_PER_MINUTE;
    return Math.max(0, Math.min(refillPerMinute, tokenConstrainedBatchSize));
};

export const getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens = async () => {
    await keepaProvider.ensureFreshTokenState();
    return getKeepaHistoryRefreshQueueBatchSize();
};

export const hasDueKeepaHistoryRefreshQueueItems = async () => {
    const rows = await db
        .select({ id: keepaHistoryRefreshQueue.id })
        .from(keepaHistoryRefreshQueue)
        .where(lte(keepaHistoryRefreshQueue.nextAttemptAt, new Date()))
        .limit(1);

    return rows.length > 0;
};

export const getDueKeepaHistoryRefreshQueueItems = async (
    limit: number
): Promise<KeepaHistoryRefreshQueueItem[]> => {
    if (limit <= 0) {
        return [];
    }

    return await db
        .select({
            id: keepaHistoryRefreshQueue.id,
            marketplaceId: keepaHistoryRefreshQueue.marketplaceId,
            asin: keepaHistoryRefreshQueue.asin,
            attemptCount: keepaHistoryRefreshQueue.attemptCount,
            nextAttemptAt: keepaHistoryRefreshQueue.nextAttemptAt,
            createdAt: keepaHistoryRefreshQueue.createdAt,
        })
        .from(keepaHistoryRefreshQueue)
        .where(lte(keepaHistoryRefreshQueue.nextAttemptAt, new Date()))
        .orderBy(asc(keepaHistoryRefreshQueue.createdAt))
        .limit(limit);
};

export const holdKeepaHistoryRefreshQueueItems = async (queueItemIds: string[]) => {
    if (queueItemIds.length === 0) {
        return;
    }

    const holdUntil = new Date(Date.now() + KEEPA_DISPATCH_HOLD_MS);
    await db
        .update(keepaHistoryRefreshQueue)
        .set({
            nextAttemptAt: holdUntil,
            updatedAt: new Date(),
        })
        .where(inArray(keepaHistoryRefreshQueue.id, queueItemIds));
};

export const getKeepaHistoryRefreshQueueItem = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const rows = await db
        .select({
            id: keepaHistoryRefreshQueue.id,
            marketplaceId: keepaHistoryRefreshQueue.marketplaceId,
            asin: keepaHistoryRefreshQueue.asin,
            attemptCount: keepaHistoryRefreshQueue.attemptCount,
        })
        .from(keepaHistoryRefreshQueue)
        .where(
            and(
                eq(keepaHistoryRefreshQueue.marketplaceId, marketplaceId),
                eq(keepaHistoryRefreshQueue.asin, asin)
            )
        )
        .limit(1);

    return rows[0] ?? null;
};

export const getKeepaHistoryDaysForAsin = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const latestSuccessImport = await db
        .select({
            createdAt: productHistoryImports.createdAt,
        })
        .from(productHistoryImports)
        .where(
            and(
                eq(productHistoryImports.marketplaceId, marketplaceId),
                eq(productHistoryImports.asin, asin),
                eq(productHistoryImports.source, 'keepa'),
                eq(productHistoryImports.status, 'success')
            )
        )
        .orderBy(desc(productHistoryImports.createdAt))
        .limit(1);

    if (latestSuccessImport.length === 0) {
        return KEEPA_INITIAL_HISTORY_DAYS;
    }

    const daysSinceLastSuccess = Math.max(
        1,
        Math.ceil((Date.now() - latestSuccessImport[0].createdAt.getTime()) / DAY_IN_MS)
    );

    const neededDays = Math.max(
        KEEPA_MIN_INCREMENTAL_HISTORY_DAYS,
        daysSinceLastSuccess + KEEPA_INCREMENTAL_BUFFER_DAYS
    );

    return Math.min(KEEPA_INITIAL_HISTORY_DAYS, neededDays);
};

export const removeKeepaHistoryRefreshQueueItem = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    await db
        .delete(keepaHistoryRefreshQueue)
        .where(
            and(
                eq(keepaHistoryRefreshQueue.marketplaceId, marketplaceId),
                eq(keepaHistoryRefreshQueue.asin, asin)
            )
        );
};

export const recordKeepaHistoryRefreshFailure = async ({
    marketplaceId,
    asin,
    errorMessage,
}: {
    marketplaceId: string;
    asin: string;
    errorMessage: string;
}) => {
    const queueItem = await getKeepaHistoryRefreshQueueItem({ marketplaceId, asin });
    if (!queueItem) {
        return null;
    }

    const failureCount = queueItem.attemptCount + 1;
    const retryDelayMs = getKeepaFailureRetryDelayMs(failureCount);
    const now = new Date();
    await db
        .update(keepaHistoryRefreshQueue)
        .set({
            attemptCount: failureCount,
            lastAttemptAt: now,
            lastError: errorMessage.slice(0, 2_000),
            nextAttemptAt: new Date(now.getTime() + retryDelayMs),
            updatedAt: now,
        })
        .where(eq(keepaHistoryRefreshQueue.id, queueItem.id));

    return { failureCount, retryDelayMs };
};
