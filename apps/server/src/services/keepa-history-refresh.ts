import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { env } from '@/config/env.js';
import { db } from '@/db/index.js';
import {
    keepaHistoryRefreshQueue,
    productHistoryImports,
    products,
} from '@/db/schema.js';
import {
    ensureFreshKeepaTokenState,
    getKeepaRuntimeTokenState,
} from '@/services/keepa.js';

const CLOTHING_SHOES_JEWELRY_CATEGORY_ID = 7141123011;
const KEEPA_AUTO_BSR_THRESHOLD = 1000000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const KEEPA_QUEUE_ENQUEUE_MIN_REFRESH_INTERVAL_MS = 48 * 60 * 60 * 1000;
const KEEPA_INITIAL_HISTORY_DAYS = 3650;
const KEEPA_MIN_INCREMENTAL_HISTORY_DAYS = 30;
const KEEPA_INCREMENTAL_BUFFER_DAYS = 7;
const KEEPA_DISPATCH_HOLD_MS = 5 * 60 * 1000;
const KEEPA_MIN_TOKEN_BUFFER = 0;
const KEEPA_TOKENS_PER_HISTORY_FETCH = 2;
const KEEPA_PROCESS_MAX_BATCH_SIZE = 10;

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
    if (!env.KEEPA_API_KEY) {
        return {
            enqueued: false,
            reason: 'keepa_not_configured',
        } as const;
    }

    const product = await getProductEligibilitySnapshot({ marketplaceId, asin });
    if (!product) {
        return {
            enqueued: false,
            reason: 'product_missing',
        } as const;
    }

    if (!isEligibleForKeepaAutoRefresh(product.rootCategoryId, product.rootCategoryBsr)) {
        return {
            enqueued: false,
            reason: 'not_eligible',
        } as const;
    }

    const recentThreshold = new Date(Date.now() - KEEPA_QUEUE_ENQUEUE_MIN_REFRESH_INTERVAL_MS);
    const recentImport = await db
        .select({
            id: productHistoryImports.id,
        })
        .from(productHistoryImports)
        .where(
            and(
                eq(productHistoryImports.marketplaceId, marketplaceId),
                eq(productHistoryImports.asin, asin),
                eq(productHistoryImports.source, 'keepa'),
                eq(productHistoryImports.status, 'success'),
                gte(productHistoryImports.createdAt, recentThreshold)
            )
        )
        .orderBy(desc(productHistoryImports.createdAt))
        .limit(1);

    if (recentImport.length > 0) {
        return {
            enqueued: false,
            reason: 'fresh_import_exists',
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
            target: [
                keepaHistoryRefreshQueue.marketplaceId,
                keepaHistoryRefreshQueue.asin,
            ],
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
    const tokenState = getKeepaRuntimeTokenState();
    const tokensLeft = tokenState.tokensLeft;

    if (typeof tokensLeft !== 'number') {
        return 1;
    }

    const tokensAvailableForDispatch = Math.max(0, tokensLeft - KEEPA_MIN_TOKEN_BUFFER);
    const tokenConstrainedBatchSize = Math.trunc(
        tokensAvailableForDispatch / KEEPA_TOKENS_PER_HISTORY_FETCH
    );

    return Math.max(0, Math.min(KEEPA_PROCESS_MAX_BATCH_SIZE, tokenConstrainedBatchSize));
};

export const getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens = async () => {
    await ensureFreshKeepaTokenState();
    return getKeepaHistoryRefreshQueueBatchSize();
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
        Math.ceil(
            (Date.now() - latestSuccessImport[0].createdAt.getTime()) / DAY_IN_MS
        )
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

export const getKeepaHistoryRefreshQueueStats = async () => {
    await ensureFreshKeepaTokenState();

    let totalQueued = 0;
    let dueNow = 0;
    let fetchesLastHour = 0;
    let fetchesLastHourSuccess = 0;
    let fetchesLastHourError = 0;
    let oldestQueuedAt: string | null = null;

    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const [keepaFetchStats] = await db
            .select({
                fetchesLastHour: sql<number>`count(*)::int`,
                fetchesLastHourSuccess: sql<number>`count(*) filter (where ${productHistoryImports.status} = 'success')::int`,
                fetchesLastHourError: sql<number>`count(*) filter (where ${productHistoryImports.status} = 'error')::int`,
            })
            .from(productHistoryImports)
            .where(
                and(
                    eq(productHistoryImports.source, 'keepa'),
                    gte(productHistoryImports.createdAt, oneHourAgo)
                )
            );

        fetchesLastHour = keepaFetchStats?.fetchesLastHour ?? 0;
        fetchesLastHourSuccess = keepaFetchStats?.fetchesLastHourSuccess ?? 0;
        fetchesLastHourError = keepaFetchStats?.fetchesLastHourError ?? 0;
    } catch (error) {
        console.error(
            '[Keepa History Refresh] Failed to read Keepa fetch stats; defaulting to 0:',
            error
        );
    }

    try {
        const [queueStats] = await db
            .select({
                totalQueued: sql<number>`count(*)::int`,
                dueNow: sql<number>`count(*) filter (where ${keepaHistoryRefreshQueue.nextAttemptAt} <= now())::int`,
                oldestQueuedAt: sql<string | null>`min(${keepaHistoryRefreshQueue.createdAt})::text`,
            })
            .from(keepaHistoryRefreshQueue);

        totalQueued = queueStats?.totalQueued ?? 0;
        dueNow = queueStats?.dueNow ?? 0;
        oldestQueuedAt = queueStats?.oldestQueuedAt ?? null;
    } catch (error) {
        console.error(
            '[Keepa History Refresh] Failed to read queue stats; returning token state only:',
            error
        );
    }

    return {
        queue: {
            totalQueued,
            dueNow,
            fetchesLastHour,
            fetchesLastHourSuccess,
            fetchesLastHourError,
            oldestQueuedAt,
            processBatchSize: getKeepaHistoryRefreshQueueBatchSize(),
        },
        tokens: getKeepaRuntimeTokenState(),
    };
};

export const shouldKeepaHistoryRefreshAsin = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const product = await getProductEligibilitySnapshot({ marketplaceId, asin });
    if (!product) {
        return {
            shouldRefresh: false,
            reason: 'product_missing',
        } as const;
    }

    if (!isEligibleForKeepaAutoRefresh(product.rootCategoryId, product.rootCategoryBsr)) {
        return {
            shouldRefresh: false,
            reason: 'not_eligible',
        } as const;
    }

    return {
        shouldRefresh: true,
        reason: 'eligible',
    } as const;
};

const getProductEligibilitySnapshot = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const rows = await db
        .select({
            rootCategoryId: products.rootCategoryId,
            rootCategoryBsr: products.rootCategoryBsr,
        })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)))
        .limit(1);

    return rows[0] ?? null;
};

const isEligibleForKeepaAutoRefresh = (
    rootCategoryId: number | null,
    rootCategoryBsr: number | null
) => {
    if (rootCategoryId !== CLOTHING_SHOES_JEWELRY_CATEGORY_ID) {
        return false;
    }

    if (typeof rootCategoryBsr !== 'number' || !Number.isFinite(rootCategoryBsr)) {
        return false;
    }

    return rootCategoryBsr < KEEPA_AUTO_BSR_THRESHOLD;
};
