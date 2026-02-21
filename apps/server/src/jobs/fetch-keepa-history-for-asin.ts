import { TRPCError } from '@trpc/server';
import type { Job } from 'pg-boss';
import { z } from 'zod';
import { defineJob } from '@/jobs/job-router.js';
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

export const fetchKeepaHistoryForAsinJob = defineJob(
    'fetch-keepa-history-for-asin',
    {
        startupSummary: 'triggered by queue processor',
        persistSuccess: 'didWork',
    }
)
    .input(z.unknown())
    .work(async (job, signal, log) => {
        void signal;

        const payload = getFetchKeepaHistoryJobPayload(job);
        if (!payload) {
            log(
                'Skipping job: missing marketplaceId or asin in job payload',
                {
                    jobId: job.id,
                    payload: job.data,
                },
                'warn'
            );

            return {
                didWork: false,
                jobId: job.id,
                status: 'skipped_invalid_payload',
            } as const;
        }

        log('Processing Keepa history fetch', payload);
        await fetchKeepaHistoryForAsin(payload);
        log('Completed Keepa history fetch', payload);

        return {
            didWork: true,
            ...payload,
            status: 'completed',
        } as const;
    });

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

type FetchKeepaHistoryJobPayload = {
    marketplaceId: string;
    asin: string;
};

const getFetchKeepaHistoryJobPayload = (job: Job<unknown>) => {
    if (!isRecord(job.data)) {
        return null;
    }

    const marketplaceId = job.data.marketplaceId;
    const asin = job.data.asin;

    if (typeof marketplaceId !== 'string' || typeof asin !== 'string') {
        return null;
    }

    if (marketplaceId.length === 0 || asin.length === 0) {
        return null;
    }

    return {
        marketplaceId,
        asin,
    } satisfies FetchKeepaHistoryJobPayload;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};
