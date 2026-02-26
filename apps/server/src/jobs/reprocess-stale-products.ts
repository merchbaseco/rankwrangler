import { and, gte, isNotNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue.js';
import { createEventLogSafe } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    BSR_THRESHOLD_1M,
    BSR_THRESHOLD_200K,
    BSR_THRESHOLD_3M,
    BSR_THRESHOLD_500K,
    REFRESH_AFTER_14_DAYS_MS,
    REFRESH_AFTER_24_HOURS_MS,
    REFRESH_AFTER_30_DAYS_MS,
    REFRESH_AFTER_3_DAYS_MS,
    REFRESH_AFTER_7_DAYS_MS,
} from '@/services/spapi-refresh-policy.js';
import { defineJob } from '@/jobs/job-router.js';

export type ReprocessStaleProductsResult = {
    didWork: boolean;
    staleProductCount: number;
    enqueuedCount: number;
    errorMessage: string | null;
};

const reprocessStaleProductsJobDeps = {
    createEventLogSafe,
};

export async function reprocessStaleProducts() {
    const now = new Date();
    const threshold24Hours = new Date(now.getTime() - REFRESH_AFTER_24_HOURS_MS);
    const threshold3Days = new Date(now.getTime() - REFRESH_AFTER_3_DAYS_MS);
    const threshold7Days = new Date(now.getTime() - REFRESH_AFTER_7_DAYS_MS);
    const threshold14Days = new Date(now.getTime() - REFRESH_AFTER_14_DAYS_MS);
    const threshold30Days = new Date(now.getTime() - REFRESH_AFTER_30_DAYS_MS);

    // Find stale merch products using BSR tiers:
    // - BSR < 200k: refresh if lastFetched > 24 hours ago
    // - BSR < 500k: refresh if lastFetched > 3 days ago
    // - BSR < 1M: refresh if lastFetched > 7 days ago
    // - BSR < 3M: refresh if lastFetched > 14 days ago
    // - BSR >= 3M: refresh if lastFetched > 30 days ago
    // - Otherwise (non-merch, null BSR): never by stale job
    const staleProducts = await db
        .select({
            marketplaceId: products.marketplaceId,
            asin: products.asin,
        })
        .from(products)
        .where(
            and(
                products.isMerchListing,
                isNotNull(products.rootCategoryBsr),
                and(
                    or(
                        // BSR < 200k: requeue if lastFetched > 24 hours ago
                        and(
                            lt(products.rootCategoryBsr, BSR_THRESHOLD_200K),
                            lt(products.lastFetched, threshold24Hours)
                        ),
                        // 200k <= BSR < 500k: requeue if lastFetched > 3 days ago
                        and(
                            gte(products.rootCategoryBsr, BSR_THRESHOLD_200K),
                            lt(products.rootCategoryBsr, BSR_THRESHOLD_500K),
                            lt(products.lastFetched, threshold3Days)
                        ),
                        // 500k <= BSR < 1M: requeue if lastFetched > 7 days ago
                        and(
                            gte(products.rootCategoryBsr, BSR_THRESHOLD_500K),
                            lt(products.rootCategoryBsr, BSR_THRESHOLD_1M),
                            lt(products.lastFetched, threshold7Days)
                        ),
                        // 1M <= BSR < 3M: requeue if lastFetched > 14 days ago
                        and(
                            gte(products.rootCategoryBsr, BSR_THRESHOLD_1M),
                            lt(products.rootCategoryBsr, BSR_THRESHOLD_3M),
                            lt(products.lastFetched, threshold14Days)
                        ),
                        // BSR >= 3M: requeue if lastFetched > 30 days ago
                        and(
                            gte(products.rootCategoryBsr, BSR_THRESHOLD_3M),
                            lt(products.lastFetched, threshold30Days)
                        )
                    )
                )
            )
        );

    if (staleProducts.length === 0) {
        return {
            didWork: false,
            staleProductCount: 0,
            enqueuedCount: 0,
            errorMessage: null,
        } satisfies ReprocessStaleProductsResult;
    }

    // Add stale products to the SP-API sync queue and trigger a wakeup when rows are inserted.
    try {
        const enqueuedCount = await enqueueSpApiSyncQueueItems(
            staleProducts.map(product => ({
                marketplaceId: product.marketplaceId,
                asin: product.asin,
            }))
        );

        return {
            didWork: true,
            staleProductCount: staleProducts.length,
            enqueuedCount,
            errorMessage: null,
        } satisfies ReprocessStaleProductsResult;
    } catch (error) {
        console.error('[Reprocess Stale Products] Error adding products to queue:', error);

        return {
            didWork: true,
            staleProductCount: staleProducts.length,
            enqueuedCount: 0,
            errorMessage:
                error instanceof Error
                    ? error.message
                    : 'Failed to enqueue stale products',
        } satisfies ReprocessStaleProductsResult;
    }
}

export const reprocessStaleProductsJob = defineJob('reprocess-stale-products', {
    persistSuccess: 'didWork',
})
    .input(z.record(z.string(), z.unknown()))
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
