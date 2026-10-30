import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { defineJob } from '@/jobs/job-router.js';
import { KEEPA_HISTORY_BATCH_JOB_NAME } from '@/jobs/fetch-keepa-history-batch';
import { createEventLogSafe } from '@/services/event-logs.js';
import { KEEPA_HISTORY_REQUEST_BATCH_SIZE } from '@/services/keepa-history-dispatch';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    getDueKeepaHistoryRefreshQueueItems,
    getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens,
    hasDueKeepaHistoryRefreshQueueItems,
    holdKeepaHistoryRefreshQueueItems,
} from '@/services/keepa-history-refresh.js';

export type ProcessKeepaHistoryRefreshQueueResult = {
    didWork: boolean;
    batchSize: number;
    dispatchedCount: number;
    reason: 'dispatched' | 'no_tokens' | 'no_due_items';
};

const processKeepaHistoryRefreshQueueJobDeps = {
    createEventLogSafe,
};

interface ProcessKeepaHistoryRefreshQueueDeps {
    getDueKeepaHistoryRefreshQueueItems: typeof getDueKeepaHistoryRefreshQueueItems;
    getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens: typeof getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens;
    hasDueKeepaHistoryRefreshQueueItems: typeof hasDueKeepaHistoryRefreshQueueItems;
    holdKeepaHistoryRefreshQueueItems: typeof holdKeepaHistoryRefreshQueueItems;
}

const defaultProcessKeepaHistoryRefreshQueueDeps: ProcessKeepaHistoryRefreshQueueDeps = {
    getDueKeepaHistoryRefreshQueueItems,
    getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens,
    hasDueKeepaHistoryRefreshQueueItems,
    holdKeepaHistoryRefreshQueueItems,
};

export async function processKeepaHistoryRefreshQueue(
    boss: PgBoss,
    deps: ProcessKeepaHistoryRefreshQueueDeps = defaultProcessKeepaHistoryRefreshQueueDeps
) {
    const hasDueWork = await deps.hasDueKeepaHistoryRefreshQueueItems();
    if (!hasDueWork) {
        return {
            didWork: false,
            batchSize: 0,
            dispatchedCount: 0,
            reason: 'no_due_items',
        } satisfies ProcessKeepaHistoryRefreshQueueResult;
    }

    const batchSize = await deps.getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens();

    if (batchSize <= 0) {
        return {
            didWork: false,
            batchSize,
            dispatchedCount: 0,
            reason: 'no_tokens',
        } satisfies ProcessKeepaHistoryRefreshQueueResult;
    }

    const queueItems = await deps.getDueKeepaHistoryRefreshQueueItems(batchSize);
    if (queueItems.length === 0) {
        return {
            didWork: false,
            batchSize,
            dispatchedCount: 0,
            reason: 'no_due_items',
        } satisfies ProcessKeepaHistoryRefreshQueueResult;
    }

    await deps.holdKeepaHistoryRefreshQueueItems(queueItems.map(item => item.id));

    for (const batch of toRequestBatches(queueItems)) {
        await boss.send(KEEPA_HISTORY_BATCH_JOB_NAME, batch, { retryLimit: 0 });
    }

    return {
        didWork: true,
        batchSize,
        dispatchedCount: queueItems.length,
        reason: 'dispatched',
    } satisfies ProcessKeepaHistoryRefreshQueueResult;
}

export const processKeepaHistoryRefreshQueueJob = defineJob(
    'process-keepa-history-refresh-queue',
    { persistSuccess: 'didWork' }
)
    .input(z.record(z.string(), z.unknown()))
    .options({
        singletonKey: 'process-keepa-history-refresh-queue',
        retryLimit: 0,
    })
    .interval({
        everyMs: 60 * 1000,
        payload: {},
    })
    .work(async (job, signal, log, { boss }) => {
        void signal;
        let outcome: 'completed' | 'failed' = 'completed';

        try {
            const result = await processKeepaHistoryRefreshQueue(boss);

            if (result.didWork) {
                log('Dispatched Keepa refresh jobs', {
                    batchSize: result.batchSize,
                    dispatchedCount: result.dispatchedCount,
                });
            }

            return result;
        } catch (error) {
            outcome = 'failed';
            await processKeepaHistoryRefreshQueueJobDeps.createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'job',
                action: 'job.fatal',
                primitiveType: 'job',
                message: 'Fatal job failure in process-keepa-history-refresh-queue.',
                detailsJson: {
                    error: getErrorMessage(error),
                    input: job.data,
                    source: 'process_keepa_history_refresh_queue_job',
                },
                jobName: 'process-keepa-history-refresh-queue',
                jobRunId: String(job.id),
                requestId: String(job.id),
            });
            throw error;
        } finally {
            log('Finished Keepa refresh dispatch job run', {
                jobId: job.id,
                outcome,
            });
        }
    });

const toRequestBatches = (items: readonly { marketplaceId: string; asin: string }[]) => {
    const batches: { marketplaceId: string; asins: string[] }[] = [];
    const openBatches = new Map<string, { marketplaceId: string; asins: string[] }>();
    for (const { marketplaceId, asin } of items) {
        let batch = openBatches.get(marketplaceId);
        if (!batch || batch.asins.length >= KEEPA_HISTORY_REQUEST_BATCH_SIZE) {
            batch = { marketplaceId, asins: [] };
            openBatches.set(marketplaceId, batch);
            batches.push(batch);
        }
        batch.asins.push(asin);
    }
    return batches;
};
