import { TRPCError } from '@trpc/server';
import { loadKeepaProductHistory as loadKeepaProductHistoryService } from '@/services/keepa.js';
import {
    getKeepaHistoryDaysForAsin as getKeepaHistoryDaysForAsinService,
    getKeepaHistoryRefreshQueueItem as getKeepaHistoryRefreshQueueItemService,
    removeKeepaHistoryRefreshQueueItem as removeKeepaHistoryRefreshQueueItemService,
    shouldKeepaHistoryRefreshAsin as shouldKeepaHistoryRefreshAsinService,
} from '@/services/keepa-history-refresh.js';

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
    removeKeepaHistoryRefreshQueueItem: typeof removeKeepaHistoryRefreshQueueItemService;
    shouldKeepaHistoryRefreshAsin: typeof shouldKeepaHistoryRefreshAsinService;
};

const defaultFetchKeepaHistoryForAsinDeps: FetchKeepaHistoryForAsinDeps = {
    loadKeepaProductHistory: loadKeepaProductHistoryService,
    getKeepaHistoryDaysForAsin: getKeepaHistoryDaysForAsinService,
    getKeepaHistoryRefreshQueueItem: getKeepaHistoryRefreshQueueItemService,
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
    let didRemoveQueueItem = false;
    const removeQueueItem = async () => {
        if (didRemoveQueueItem) {
            return;
        }

        didRemoveQueueItem = true;
        await deps.removeKeepaHistoryRefreshQueueItem({
            marketplaceId,
            asin,
        });
    };

    try {
        const summary = await deps.loadKeepaProductHistory({
            marketplaceId,
            asin,
            days: historyDays,
            queuePriority: 'background',
        });

        await removeQueueItem();

        if (summary.status === 'success') {
            return;
        }

        throw new TRPCError({
            code: 'BAD_GATEWAY',
            message:
                summary.errorMessage ??
                'Keepa history refresh completed with a non-success status',
        });
    } catch (error) {
        await removeQueueItem();

        if (isNonRetryableKeepaRefreshError(error)) {
            return;
        }

        throw error;
    }
};

const isNonRetryableKeepaRefreshError = (error: unknown) => {
    return (
        error instanceof TRPCError &&
        NON_RETRYABLE_KEEPA_REFRESH_ERROR_CODES.has(error.code)
    );
};
