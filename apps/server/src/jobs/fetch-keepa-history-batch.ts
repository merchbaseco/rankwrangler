import { z } from 'zod';
import { defineJob } from '@/jobs/job-router';
import { deferKeepaHistory } from '@/services/defer-keepa-history';
import { createEventLogSafe } from '@/services/event-logs';
import { loadKeepaHistoryBatch } from '@/services/keepa-history-batch';
import {
    getKeepaHistoryDaysForAsin,
    getKeepaHistoryRefreshQueueItem,
    KEEPA_INITIAL_HISTORY_DAYS,
    recordKeepaHistoryRefreshFailure,
    removeKeepaHistoryRefreshQueueItem,
} from '@/services/keepa-history-refresh';
import { shouldKeepaHistoryRefreshAsin } from '@/services/product-history-eligibility';
import { KeepaCapacityDeferredError } from '@/services/providers/keepa/keepa-capacity-types';

export const KEEPA_HISTORY_BATCH_JOB_NAME = 'fetch-keepa-history-batch';

const defaultDeps = {
    deferKeepaHistory,
    createEventLogSafe,
    loadKeepaHistoryBatch,
    getKeepaHistoryDaysForAsin,
    getKeepaHistoryRefreshQueueItem,
    recordKeepaHistoryRefreshFailure,
    removeKeepaHistoryRefreshQueueItem,
    shouldKeepaHistoryRefreshAsin,
};

type FetchKeepaHistoryBatchDeps = typeof defaultDeps;

const payloadSchema = z.object({
    marketplaceId: z.string().min(1),
    asins: z.array(z.string().min(1)).min(1).max(100),
});

export const fetchKeepaHistoryBatchJob = defineJob(KEEPA_HISTORY_BATCH_JOB_NAME, {
    startupSummary: 'triggered by queue processor',
    persistSuccess: 'didWork',
})
    .input(payloadSchema)
    .work(async job => {
        const result = await fetchKeepaHistoryBatch(job.data);
        return { didWork: result.synced + result.failed > 0, ...result };
    });

export const fetchKeepaHistoryBatch = async (
    { marketplaceId, asins }: z.infer<typeof payloadSchema>,
    deps: FetchKeepaHistoryBatchDeps = defaultDeps
) => {
    const due: { asin: string; days: number }[] = [];
    for (const asin of asins) {
        if (!(await deps.getKeepaHistoryRefreshQueueItem({ marketplaceId, asin }))) {
            continue;
        }
        if (!(await deps.shouldKeepaHistoryRefreshAsin({ marketplaceId, asin })).shouldRefresh) {
            await deps.removeKeepaHistoryRefreshQueueItem({ marketplaceId, asin });
            continue;
        }
        due.push({ asin, days: await deps.getKeepaHistoryDaysForAsin({ marketplaceId, asin }) });
    }

    const synced: string[] = [];
    const failed: { asin: string; message: string }[] = [];
    for (const group of groupByRequestDays(due)) {
        let outcomes: Awaited<ReturnType<typeof deps.loadKeepaHistoryBatch>>;
        try {
            outcomes = await deps.loadKeepaHistoryBatch({ marketplaceId, ...group });
        } catch (error) {
            if (!(error instanceof KeepaCapacityDeferredError)) {
                throw error;
            }
            for (const asin of group.asins) {
                await deps.deferKeepaHistory({ marketplaceId, asin, retryAt: error.retryAt });
            }
            continue;
        }
        for (const outcome of outcomes) {
            if (outcome.status === 'success') {
                await deps.removeKeepaHistoryRefreshQueueItem({ marketplaceId, asin: outcome.asin });
                synced.push(outcome.asin);
                continue;
            }
            await deps.recordKeepaHistoryRefreshFailure({
                marketplaceId,
                asin: outcome.asin,
                errorMessage: outcome.message,
            });
            failed.push({ asin: outcome.asin, message: outcome.message });
        }
    }

    if (synced.length > 0) {
        await deps.createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'history',
            action: 'history.sync.background',
            primitiveType: 'history',
            message: `Synced history for ${synced.length} products.`,
            detailsJson: { asins: synced, marketplaceId, source: 'keepa_background_job' },
            marketplaceId,
        });
    }
    for (const { asin, message } of failed) {
        await deps.createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'history',
            action: 'history.sync.background',
            primitiveType: 'history',
            message: `History sync failed for ${asin}.`,
            detailsJson: { error: message, marketplaceId, source: 'keepa_background_job' },
            primitiveId: asin,
            marketplaceId,
            asin,
        });
    }
    return { synced: synced.length, failed: failed.length };
};

// A first sync needs the full history; later syncs share one request at the longest gap.
const groupByRequestDays = (due: readonly { asin: string; days: number }[]) => {
    const initial = due.filter(item => item.days >= KEEPA_INITIAL_HISTORY_DAYS);
    const incremental = due.filter(item => item.days < KEEPA_INITIAL_HISTORY_DAYS);
    return [initial, incremental]
        .filter(items => items.length > 0)
        .map(items => ({
            asins: items.map(item => item.asin),
            days: Math.max(...items.map(item => item.days)),
        }));
};
