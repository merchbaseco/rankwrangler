import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { jobExecutions, keepaHistoryRefreshQueue } from '@/db/schema.js';

const FETCH_KEEPA_HISTORY_JOB_NAME = 'fetch-keepa-history-for-asin';

type KeepaLogInput = {
    queueLimit: number;
    processedLimit: number;
};

export type KeepaQueueRecord = {
    id: string;
    marketplaceId: string;
    asin: string;
    attemptCount: number;
    nextAttemptAt: string;
    lastAttemptAt: string | null;
    lastError: string | null;
    createdAt: string;
};

export type KeepaProcessedRecord = {
    id: string;
    status: string;
    marketplaceId: string | null;
    asin: string | null;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    errorMessage: string | null;
};

export type KeepaLogSnapshot = {
    queue: {
        totalQueued: number;
        items: KeepaQueueRecord[];
    };
    processed: KeepaProcessedRecord[];
};

export const getKeepaLogSnapshot = async ({
    queueLimit,
    processedLimit,
}: KeepaLogInput): Promise<KeepaLogSnapshot> => {
    const [queueTotals, queueItems, processedExecutions] = await Promise.all([
        db
            .select({
                totalQueued: sql<number>`count(*)::int`,
            })
            .from(keepaHistoryRefreshQueue),
        db
            .select({
                id: keepaHistoryRefreshQueue.id,
                marketplaceId: keepaHistoryRefreshQueue.marketplaceId,
                asin: keepaHistoryRefreshQueue.asin,
                attemptCount: keepaHistoryRefreshQueue.attemptCount,
                nextAttemptAt: keepaHistoryRefreshQueue.nextAttemptAt,
                lastAttemptAt: keepaHistoryRefreshQueue.lastAttemptAt,
                lastError: keepaHistoryRefreshQueue.lastError,
                createdAt: keepaHistoryRefreshQueue.createdAt,
            })
            .from(keepaHistoryRefreshQueue)
            .orderBy(
                asc(keepaHistoryRefreshQueue.nextAttemptAt),
                asc(keepaHistoryRefreshQueue.createdAt)
            )
            .limit(queueLimit),
        db
            .select({
                id: jobExecutions.id,
                status: jobExecutions.status,
                input: jobExecutions.input,
                errorMessage: jobExecutions.errorMessage,
                startedAt: jobExecutions.startedAt,
                finishedAt: jobExecutions.finishedAt,
            })
            .from(jobExecutions)
            .where(eq(jobExecutions.jobName, FETCH_KEEPA_HISTORY_JOB_NAME))
            .orderBy(desc(jobExecutions.finishedAt))
            .limit(processedLimit),
    ]);

    const [queueTotal] = queueTotals;

    return {
        queue: {
            totalQueued: queueTotal?.totalQueued ?? 0,
            items: queueItems.map(item => ({
                id: item.id,
                marketplaceId: item.marketplaceId,
                asin: item.asin,
                attemptCount: item.attemptCount,
                nextAttemptAt: item.nextAttemptAt.toISOString(),
                lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null,
                lastError: item.lastError,
                createdAt: item.createdAt.toISOString(),
            })),
        },
        processed: processedExecutions.map(execution => {
            const payload = getKeepaJobPayload(execution.input);

            return {
                id: execution.id,
                status: execution.status,
                marketplaceId: payload?.marketplaceId ?? null,
                asin: payload?.asin ?? null,
                startedAt: execution.startedAt.toISOString(),
                finishedAt: execution.finishedAt.toISOString(),
                durationMs:
                    execution.finishedAt.getTime() - execution.startedAt.getTime(),
                errorMessage: execution.errorMessage,
            };
        }),
    };
};

const getKeepaJobPayload = (input: unknown) => {
    if (!isRecord(input)) {
        return null;
    }

    const marketplaceId = input.marketplaceId;
    const asin = input.asin;

    if (typeof marketplaceId !== 'string' || typeof asin !== 'string') {
        return null;
    }

    if (marketplaceId.length === 0 || asin.length === 0) {
        return null;
    }

    return {
        marketplaceId,
        asin,
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};
