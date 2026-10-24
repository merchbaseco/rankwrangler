import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryRefreshQueue, productHistoryImports } from '@/db/schema';
import { getKeepaHistoryRefreshQueueBatchSize } from '@/services/keepa-history-refresh';
import { createKeepaProvider } from '@/services/providers/keepa/keepa-provider';

const keepaProvider = createKeepaProvider();

export const getKeepaHistoryRefreshQueueStats = async () => {
    await keepaProvider.ensureFreshTokenState();

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
                oldestQueuedAt: sql<
                    string | null
                >`min(${keepaHistoryRefreshQueue.createdAt})::text`,
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
        tokens: keepaProvider.getRuntimeTokenState(),
    };
};
