import { TRPCError } from '@trpc/server';
import { loadKeepaProductHistory as loadKeepaProductHistoryService } from '@/services/keepa.js';
import {
    getKeepaHistoryDaysForAsin as getKeepaHistoryDaysForAsinService,
    getKeepaHistoryRefreshQueueItem as getKeepaHistoryRefreshQueueItemService,
    markKeepaHistoryRefreshDeferred as markKeepaHistoryRefreshDeferredService,
    markKeepaHistoryRefreshFailure as markKeepaHistoryRefreshFailureService,
    markKeepaHistoryRefreshSuccess as markKeepaHistoryRefreshSuccessService,
    removeKeepaHistoryRefreshQueueItem as removeKeepaHistoryRefreshQueueItemService,
    shouldKeepaHistoryRefreshAsin as shouldKeepaHistoryRefreshAsinService,
} from '@/services/keepa-history-refresh.js';

const KEEPA_MIN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NON_RETRYABLE_KEEPA_REFRESH_ERROR_CODES = new Set<TRPCError['code']>([
    'BAD_REQUEST',
    'NOT_FOUND',
]);

type FetchKeepaHistoryForAsinParams = {
    marketplaceId: string;
    asin: string;
};

type FetchKeepaHistoryForAsinDeps = {
    loadKeepaProductHistory: typeof loadKeepaProductHistoryService;
    getKeepaHistoryDaysForAsin: typeof getKeepaHistoryDaysForAsinService;
    getKeepaHistoryRefreshQueueItem: typeof getKeepaHistoryRefreshQueueItemService;
    markKeepaHistoryRefreshDeferred: typeof markKeepaHistoryRefreshDeferredService;
    markKeepaHistoryRefreshFailure: typeof markKeepaHistoryRefreshFailureService;
    markKeepaHistoryRefreshSuccess: typeof markKeepaHistoryRefreshSuccessService;
    removeKeepaHistoryRefreshQueueItem: typeof removeKeepaHistoryRefreshQueueItemService;
    shouldKeepaHistoryRefreshAsin: typeof shouldKeepaHistoryRefreshAsinService;
};

const defaultFetchKeepaHistoryForAsinDeps: FetchKeepaHistoryForAsinDeps = {
    loadKeepaProductHistory: loadKeepaProductHistoryService,
    getKeepaHistoryDaysForAsin: getKeepaHistoryDaysForAsinService,
    getKeepaHistoryRefreshQueueItem: getKeepaHistoryRefreshQueueItemService,
    markKeepaHistoryRefreshDeferred: markKeepaHistoryRefreshDeferredService,
    markKeepaHistoryRefreshFailure: markKeepaHistoryRefreshFailureService,
    markKeepaHistoryRefreshSuccess: markKeepaHistoryRefreshSuccessService,
    removeKeepaHistoryRefreshQueueItem: removeKeepaHistoryRefreshQueueItemService,
    shouldKeepaHistoryRefreshAsin: shouldKeepaHistoryRefreshAsinService,
};

export const fetchKeepaHistoryForAsin = async (
    { marketplaceId, asin }: FetchKeepaHistoryForAsinParams,
    deps: FetchKeepaHistoryForAsinDeps = defaultFetchKeepaHistoryForAsinDeps
) => {
    const queueItem = await deps.getKeepaHistoryRefreshQueueItem({
        marketplaceId,
        asin,
    });

    if (!queueItem) {
        return;
    }

    const eligibility = await deps.shouldKeepaHistoryRefreshAsin({
        marketplaceId,
        asin,
    });

    if (!eligibility.shouldRefresh) {
        await deps.removeKeepaHistoryRefreshQueueItem({
            marketplaceId,
            asin,
        });
        return;
    }

    const historyDays = await deps.getKeepaHistoryDaysForAsin({
        marketplaceId,
        asin,
    });

    try {
        const summary = await deps.loadKeepaProductHistory({
            marketplaceId,
            asin,
            days: historyDays,
            queuePriority: 'background',
        });

        if (summary.status === 'success') {
            await deps.markKeepaHistoryRefreshSuccess({
                marketplaceId,
                asin,
            });
            return;
        }

        const deferredUntil = new Date(
            Date.parse(summary.importedAt) + KEEPA_MIN_REFRESH_INTERVAL_MS
        );

        await deps.markKeepaHistoryRefreshDeferred({
            marketplaceId,
            asin,
            nextAttemptAt: deferredUntil,
            reason: summary.errorMessage ?? 'Recent Keepa error import exists',
        });
    } catch (error) {
        if (isNonRetryableKeepaRefreshError(error)) {
            await deps.removeKeepaHistoryRefreshQueueItem({
                marketplaceId,
                asin,
            });
            return;
        }

        const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch Keepa history';

        await deps.markKeepaHistoryRefreshFailure({
            marketplaceId,
            asin,
            attemptCount: queueItem.attemptCount,
            errorMessage,
        });

        throw error;
    }
};

const isNonRetryableKeepaRefreshError = (error: unknown) => {
    return (
        error instanceof TRPCError &&
        NON_RETRYABLE_KEEPA_REFRESH_ERROR_CODES.has(error.code)
    );
};
