import { and, asc, gte, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { defineJob } from '@/jobs/job-router';
import { createEventLogSafe } from '@/services/event-logs';
import { getErrorMessage } from '@/services/job-executions-utils';
import {
    BSR_THRESHOLD_1M,
    BSR_THRESHOLD_3M,
    BSR_THRESHOLD_200K,
    BSR_THRESHOLD_500K,
    REFRESH_AFTER_3_DAYS_MS,
    REFRESH_AFTER_7_DAYS_MS,
    REFRESH_AFTER_14_DAYS_MS,
    REFRESH_AFTER_24_HOURS_MS,
    REFRESH_AFTER_30_DAYS_MS,
} from '@/services/spapi-refresh-policy';
import { buildAvailableMerchRefreshCondition } from '@/services/spapi-refresh-selection';
import {
    buildSpApiBlindspotRefreshCondition,
    SPAPI_BLINDSPOT_SCAN_LIMIT,
} from '@/services/spapi-blindspot-selection';
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

export async function reprocessStaleProducts() {
    const now = new Date();
    const threshold24Hours = new Date(now.getTime() - REFRESH_AFTER_24_HOURS_MS);
    const threshold3Days = new Date(now.getTime() - REFRESH_AFTER_3_DAYS_MS);
    const threshold7Days = new Date(now.getTime() - REFRESH_AFTER_7_DAYS_MS);
    const threshold14Days = new Date(now.getTime() - REFRESH_AFTER_14_DAYS_MS);
    const threshold30Days = new Date(now.getTime() - REFRESH_AFTER_30_DAYS_MS);

    const staleProducts = await db
        .select({
            marketplaceId: products.marketplaceId,
            asin: products.asin,
        })
        .from(products)
        .where(
            buildAvailableMerchRefreshCondition(
                or(
                    isNull(products.spApiFetchedAt),
                    and(
                        lt(products.rootCategoryBsr, BSR_THRESHOLD_200K),
                        lt(products.spApiFetchedAt, threshold24Hours)
                    ),
                    and(
                        gte(products.rootCategoryBsr, BSR_THRESHOLD_200K),
                        lt(products.rootCategoryBsr, BSR_THRESHOLD_500K),
                        lt(products.spApiFetchedAt, threshold3Days)
                    ),
                    and(
                        gte(products.rootCategoryBsr, BSR_THRESHOLD_500K),
                        lt(products.rootCategoryBsr, BSR_THRESHOLD_1M),
                        lt(products.spApiFetchedAt, threshold7Days)
                    ),
                    and(
                        gte(products.rootCategoryBsr, BSR_THRESHOLD_1M),
                        lt(products.rootCategoryBsr, BSR_THRESHOLD_3M),
                        lt(products.spApiFetchedAt, threshold14Days)
                    ),
                    and(
                        gte(products.rootCategoryBsr, BSR_THRESHOLD_3M),
                        lt(products.spApiFetchedAt, threshold30Days)
                    )
                )
            )
        );

    const blindspotProducts = await db
        .select({ marketplaceId: products.marketplaceId, asin: products.asin })
        .from(products)
        .where(buildSpApiBlindspotRefreshCondition(now))
        .orderBy(asc(products.spApiFetchedAt), asc(products.createdAt), asc(products.id))
        .limit(SPAPI_BLINDSPOT_SCAN_LIMIT);
    const dueProducts = [...staleProducts, ...blindspotProducts];

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
