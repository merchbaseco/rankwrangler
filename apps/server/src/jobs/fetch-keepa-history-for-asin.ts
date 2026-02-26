import { TRPCError } from '@trpc/server';
import type { Job } from 'pg-boss';
import { z } from 'zod';
import { defineJob } from '@/jobs/job-router.js';
import { createEventLogSafe as createEventLogSafeService } from '@/services/event-logs.js';
import { loadKeepaProductHistory as loadKeepaProductHistoryService } from '@/services/keepa.js';
import {
    getKeepaHistoryDaysForAsin as getKeepaHistoryDaysForAsinService,
    getKeepaHistoryRefreshQueueItem as getKeepaHistoryRefreshQueueItemService,
    removeKeepaHistoryRefreshQueueItem as removeKeepaHistoryRefreshQueueItemService,
    shouldKeepaHistoryRefreshAsin as shouldKeepaHistoryRefreshAsinService,
} from '@/services/keepa-history-refresh.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';

const NON_RETRYABLE_KEEPA_REFRESH_ERROR_CODES = new Set<TRPCError['code']>([
    'BAD_REQUEST',
    'NOT_FOUND',
]);

type FetchKeepaHistoryForAsinParams = {
    marketplaceId: string;
    asin: string;
};

type FetchKeepaHistoryForAsinDeps = {
    createEventLogSafe: typeof createEventLogSafeService;
    loadKeepaProductHistory: typeof loadKeepaProductHistoryService;
    getKeepaHistoryDaysForAsin: typeof getKeepaHistoryDaysForAsinService;
    getKeepaHistoryRefreshQueueItem: typeof getKeepaHistoryRefreshQueueItemService;
    removeKeepaHistoryRefreshQueueItem: typeof removeKeepaHistoryRefreshQueueItemService;
    shouldKeepaHistoryRefreshAsin: typeof shouldKeepaHistoryRefreshAsinService;
};

const defaultFetchKeepaHistoryForAsinDeps: FetchKeepaHistoryForAsinDeps = {
    createEventLogSafe: createEventLogSafeService,
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
        let outcome: 'completed' | 'failed' | 'skipped_invalid_payload' = 'completed';

        try {
            const payload = getFetchKeepaHistoryJobPayload(job);
            if (!payload) {
                outcome = 'skipped_invalid_payload';
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
        } catch (error) {
            outcome = 'failed';
            await defaultFetchKeepaHistoryForAsinDeps.createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'job',
                action: 'job.fatal',
                primitiveType: 'job',
                message: 'Fatal job failure in fetch-keepa-history-for-asin.',
                detailsJson: {
                    error: getErrorMessage(error),
                    input: job.data,
                    source: 'fetch_keepa_history_for_asin_job',
                },
                jobName: 'fetch-keepa-history-for-asin',
                jobRunId: String(job.id),
                requestId: String(job.id),
            });
            throw error;
        } finally {
            log('Finished Keepa history fetch job run', {
                jobId: job.id,
                outcome,
            });
        }
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
            await deps.createEventLogSafe({
                level: 'info',
                status: 'success',
                category: 'history',
                action: 'history.sync.background',
                primitiveType: 'history',
                message: `Synced history for ${asin}.`,
                detailsJson: {
                    cached: summary.cached,
                    days: historyDays,
                    importedAt: summary.importedAt,
                    marketplaceId,
                    pointsStored: summary.pointsStored,
                    source: 'keepa_background_job',
                },
                primitiveId: asin,
                marketplaceId,
                asin,
            });
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
        await deps.createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'history',
            action: 'history.sync.background',
            primitiveType: 'history',
            message: `History sync failed for ${asin}.`,
            detailsJson: {
                error: getErrorMessage(error),
                marketplaceId,
                source: 'keepa_background_job',
            },
            primitiveId: asin,
            marketplaceId,
            asin,
        });

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
