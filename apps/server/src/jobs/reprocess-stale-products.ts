import { z } from 'zod';
import { defineJob } from '@/jobs/job-router';
import { createEventLogSafe } from '@/services/event-logs';
import { getErrorMessage } from '@/services/job-executions-utils';
import { listDueSpApiBlindspots, listDueSpApiRefreshes } from '@/services/spapi-refresh-selection';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue';

export type ReprocessStaleProductsResult = {
    didWork: boolean;
    staleProductCount: number;
    enqueuedCount: number;
    errorMessage: string | null;
};

const reprocessStaleProductsJobDeps = {
    createEventLogSafe,
};

// Both listings are bounded and index-backed (see product-refresh-due), so a long pause leaves a
// backlog that drains over successive runs rather than one unbounded read and insert.
export async function reprocessStaleProducts(now = new Date()) {
    const dueProducts = [
        ...(await listDueSpApiRefreshes(now)),
        ...(await listDueSpApiBlindspots(now)),
    ];

    if (dueProducts.length === 0) {
        return {
            didWork: false,
            staleProductCount: 0,
            enqueuedCount: 0,
            errorMessage: null,
        } satisfies ReprocessStaleProductsResult;
    }

    try {
        const enqueuedCount = await enqueueSpApiSyncQueueItems(
            dueProducts.map(product => ({
                marketplaceId: product.marketplaceId,
                asin: product.asin,
            }))
        );

        return {
            didWork: true,
            staleProductCount: dueProducts.length,
            enqueuedCount,
            errorMessage: null,
        } satisfies ReprocessStaleProductsResult;
    } catch (error) {
        console.error('[Reprocess Stale Products] Error adding products to queue:', error);

        return {
            didWork: true,
            staleProductCount: dueProducts.length,
            enqueuedCount: 0,
            errorMessage:
                error instanceof Error ? error.message : 'Failed to enqueue stale products',
        } satisfies ReprocessStaleProductsResult;
    }
}

export const reprocessStaleProductsJob = defineJob('reprocess-stale-products', {
    persistSuccess: 'didWork',
})
    .input(z.record(z.string(), z.unknown()))
    .options({
        singletonKey: 'reprocess-stale-products',
    })
    .cron({
        cron: '*/10 * * * *',
        payload: {},
    })
    .work(async (job, signal, log) => {
        void signal;
        let outcome: 'completed' | 'failed' = 'completed';

        try {
            const result = await reprocessStaleProducts();

            if (result.errorMessage) {
                log(
                    'Failed to enqueue stale products',
                    {
                        staleProductCount: result.staleProductCount,
                        error: result.errorMessage,
                    },
                    'error'
                );
            } else if (result.didWork) {
                log('Queued stale products for reprocessing', {
                    staleProductCount: result.staleProductCount,
                    enqueuedCount: result.enqueuedCount,
                });
            }

            return result;
        } catch (error) {
            outcome = 'failed';
            await reprocessStaleProductsJobDeps.createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'job',
                action: 'job.fatal',
                primitiveType: 'job',
                message: 'Fatal job failure in reprocess-stale-products.',
                detailsJson: {
                    error: getErrorMessage(error),
                    input: job.data,
                    source: 'reprocess_stale_products_job',
                },
                jobName: 'reprocess-stale-products',
                jobRunId: String(job.id),
                requestId: String(job.id),
            });
            throw error;
        } finally {
            log('Finished stale product reprocess job run', {
                jobId: job.id,
                outcome,
            });
        }
    });
