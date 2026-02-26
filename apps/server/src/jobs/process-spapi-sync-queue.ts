import { z } from 'zod';
import { deleteProductByMarketplaceAsin } from '@/db/product/delete-product.js';
import { upsertProductInfo } from '@/db/product/upsert-product.js';
import { deleteSpApiSyncQueueItems } from '@/db/spapi-sync-queue/delete-queue-items.js';
import { getSpApiSyncQueueItems } from '@/db/spapi-sync-queue/get-queue-items.js';
import { defineJob } from '@/jobs/job-router.js';
import { createEventLogSafe, createEventLogsSafe } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import { sendProcessSpApiSyncQueueJob } from '@/services/spapi-sync-queue.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';

const SP_API_SYNC_BATCH_SIZE = 20;
type ProcessSpApiSyncQueueFailureStage = 'fetch' | 'upsert' | 'delete_product' | 'delete_queue';
const processSpApiSyncQueueJobDeps = {
    createEventLogSafe,
};
type ProcessSpApiSyncQueueDeps = {
    getSpApiSyncQueueItems: typeof getSpApiSyncQueueItems;
    searchCatalogItemsByAsins: typeof searchCatalogItemsByAsins;
    upsertProductInfo: typeof upsertProductInfo;
    deleteProductByMarketplaceAsin: typeof deleteProductByMarketplaceAsin;
    deleteSpApiSyncQueueItems: typeof deleteSpApiSyncQueueItems;
    createEventLogsSafe: typeof createEventLogsSafe;
};
export type ProcessSpApiSyncQueueResult = {
    didWork: boolean;
    marketplaceId: string | null;
    queueCount: number;
    upsertedCount: number;
    deletedCount: number;
    hasMore: boolean;
};
const defaultProcessSpApiSyncQueueDeps: ProcessSpApiSyncQueueDeps = {
    getSpApiSyncQueueItems,
    searchCatalogItemsByAsins,
    upsertProductInfo,
    deleteProductByMarketplaceAsin,
    deleteSpApiSyncQueueItems,
    createEventLogsSafe,
};
export async function processSpApiSyncQueue(
    deps: ProcessSpApiSyncQueueDeps = defaultProcessSpApiSyncQueueDeps
) {
    const queueItems = await deps.getSpApiSyncQueueItems(SP_API_SYNC_BATCH_SIZE + 1);

    if (queueItems.length === 0) {
        return {
            didWork: false,
            marketplaceId: null,
            queueCount: 0,
            upsertedCount: 0,
            deletedCount: 0,
            hasMore: false,
        } satisfies ProcessSpApiSyncQueueResult;
    }

    let hasMore = queueItems.length > SP_API_SYNC_BATCH_SIZE;
    const queueItemsToProcess = hasMore
        ? queueItems.slice(0, SP_API_SYNC_BATCH_SIZE)
        : queueItems;
    const marketplaceId = queueItemsToProcess[0].marketplaceId;
    const asins = queueItemsToProcess.map(item => item.asin);
    const itemIds = queueItemsToProcess.map(item => item.id);

    let fetchedProducts: Awaited<ReturnType<typeof searchCatalogItemsByAsins>> = [];
    const syncedAsinSet = new Set<string>();
    const deletedByAsin = new Map<string, boolean>();
    let noPayloadQueueItems: typeof queueItemsToProcess = [];
    let failureStage: ProcessSpApiSyncQueueFailureStage = 'fetch';

    try {
        fetchedProducts = await deps.searchCatalogItemsByAsins(
            marketplaceId,
            asins,
            'rankwrangler_job_process-spapi-sync-queue'
        );

        if (fetchedProducts.length > 0) {
            failureStage = 'upsert';
            for (const productInfo of fetchedProducts) {
                await deps.upsertProductInfo(productInfo);
                syncedAsinSet.add(productInfo.asin);
            }
        }

        const fetchedAsinSet = new Set(fetchedProducts.map(product => product.asin));
        noPayloadQueueItems = queueItemsToProcess.filter(
            queueItem => !fetchedAsinSet.has(queueItem.asin)
        );

        if (noPayloadQueueItems.length > 0) {
            failureStage = 'delete_product';
            for (const queueItem of noPayloadQueueItems) {
                const didDelete = await deps.deleteProductByMarketplaceAsin(
                    queueItem.marketplaceId,
                    queueItem.asin
                );
                deletedByAsin.set(queueItem.asin, didDelete);
            }
        }

        failureStage = 'delete_queue';
        await deps.deleteSpApiSyncQueueItems(itemIds);
    } catch (error) {
        const failedQueueItems = queueItemsToProcess.filter(
            queueItem => !syncedAsinSet.has(queueItem.asin)
        );
        const errorMessage = getErrorMessage(error);

        if (failedQueueItems.length > 0) {
            await deps.createEventLogsSafe(
                failedQueueItems.map(queueItem =>
                    buildProductSyncFailedLog({
                        marketplaceId: queueItem.marketplaceId,
                        asin: queueItem.asin,
                        message: `Product sync failed for ${queueItem.asin}.`,
                        details: {
                            error: errorMessage,
                            stage: failureStage,
                            source: 'spapi_sync_queue_job',
                        },
                    })
                )
            );
        }

        throw error;
    }

    await deps.createEventLogsSafe([
        ...fetchedProducts.map(product =>
            buildProductSyncedLog({
                marketplaceId: product.marketplaceId,
                asin: product.asin,
            })
        ),
        ...noPayloadQueueItems.map(queueItem =>
            buildProductDeletedLog({
                marketplaceId: queueItem.marketplaceId,
                asin: queueItem.asin,
                deletedFromStore: deletedByAsin.get(queueItem.asin) ?? false,
            })
        ),
    ]);

    if (!hasMore) {
        const remainingItems = await deps.getSpApiSyncQueueItems(1);
        hasMore = remainingItems.length > 0;
    }

    return {
        didWork: true,
        marketplaceId,
        queueCount: queueItemsToProcess.length,
        upsertedCount: fetchedProducts.length,
        deletedCount: noPayloadQueueItems.length,
        hasMore,
    } satisfies ProcessSpApiSyncQueueResult;
}

export const processSpApiSyncQueueJob = defineJob(
    'process-spapi-sync-queue',
    {
        persistSuccess: 'didWork',
        startupSummary: 'event-driven, singleton + startup kick',
    }
)
    .input(z.record(z.string(), z.unknown()))
    .options({
        singletonKey: 'process-spapi-sync-queue',
        retryLimit: 0,
    })
    .work(async (job, signal, log) => {
        void signal;
        let outcome: 'completed' | 'failed' = 'completed';

        try {
            const result = await processSpApiSyncQueue();

            if (result.didWork) {
                log('Processed SP-API sync queue batch', {
                    marketplaceId: result.marketplaceId,
                    queueCount: result.queueCount,
                    upsertedCount: result.upsertedCount,
                    deletedCount: result.deletedCount,
                    hasMore: result.hasMore,
                });
            }

            if (result.hasMore) {
                await sendProcessSpApiSyncQueueJob({ singleton: false });
            }

            return result;
        } catch (error) {
            outcome = 'failed';
            await processSpApiSyncQueueJobDeps.createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'job',
                action: 'job.fatal',
                primitiveType: 'job',
                message: 'Fatal job failure in process-spapi-sync-queue.',
                detailsJson: {
                    error: getErrorMessage(error),
                    input: job.data,
                    source: 'process_spapi_sync_queue_job',
                },
                jobName: 'process-spapi-sync-queue',
                jobRunId: String(job.id),
                requestId: String(job.id),
            });
            throw error;
        } finally {
            log('Finished SP-API sync queue job run', {
                jobId: job.id,
                outcome,
            });
        }
    });

const buildProductSyncedLog = ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => ({
    level: 'info' as const,
    status: 'success' as const,
    category: 'product',
    action: 'product.sync',
    primitiveType: 'product' as const,
    message: `Synced product ${asin}.`,
    detailsJson: {
        marketplaceId,
        asin,
        source: 'spapi_sync_queue_job',
    },
    primitiveId: asin,
    marketplaceId,
    asin,
});

const buildProductSyncFailedLog = ({
    marketplaceId,
    asin,
    message,
    details,
}: {
    marketplaceId: string;
    asin: string;
    message: string;
    details: Record<string, unknown>;
}) => ({
    level: 'error' as const,
    status: 'failed' as const,
    category: 'product',
    action: 'product.sync',
    primitiveType: 'product' as const,
    message,
    detailsJson: {
        marketplaceId,
        asin,
        ...details,
    },
    primitiveId: asin,
    marketplaceId,
    asin,
});

const buildProductDeletedLog = ({
    marketplaceId,
    asin,
    deletedFromStore,
}: {
    marketplaceId: string;
    asin: string;
    deletedFromStore: boolean;
}) => ({
    level: 'warn' as const,
    status: 'success' as const,
    category: 'product',
    action: 'product.deleted',
    primitiveType: 'product' as const,
    message: `Marked product ${asin} as deleted after SP-API returned no product payload.`,
    detailsJson: {
        marketplaceId,
        asin,
        deletedFromStore,
        reason: 'spapi_no_product_payload',
        source: 'spapi_sync_queue_job',
    },
    primitiveId: asin,
    marketplaceId,
    asin,
});
