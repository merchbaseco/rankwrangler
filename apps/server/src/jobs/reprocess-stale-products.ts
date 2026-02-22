import { and, gte, isNotNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue.js';
import { defineJob } from '@/jobs/job-router.js';

// BSR thresholds
const BSR_THRESHOLD_200K = 200000;
const BSR_THRESHOLD_500K = 500000;
const BSR_THRESHOLD_1M = 1000000;
const BSR_THRESHOLD_3M = 3000000;

// Time thresholds in milliseconds
const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_3 = 3 * 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const DAYS_14 = 14 * 24 * 60 * 60 * 1000;
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

export type ReprocessStaleProductsResult = {
    didWork: boolean;
    staleProductCount: number;
    enqueuedCount: number;
    errorMessage: string | null;
};

export async function reprocessStaleProducts() {
    const now = new Date();
    const threshold24Hours = new Date(now.getTime() - HOURS_24);
    const threshold3Days = new Date(now.getTime() - DAYS_3);
    const threshold7Days = new Date(now.getTime() - DAYS_7);
    const threshold14Days = new Date(now.getTime() - DAYS_14);
    const threshold30Days = new Date(now.getTime() - DAYS_30);

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
        void job;
        void signal;

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
    });
