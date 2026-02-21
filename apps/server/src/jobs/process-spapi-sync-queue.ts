import { z } from 'zod';
import { upsertProductInfo } from '@/db/product/upsert-product.js';
import { deleteSpApiSyncQueueItems } from '@/db/spapi-sync-queue/delete-queue-items.js';
import { getSpApiSyncQueueItems } from '@/db/spapi-sync-queue/get-queue-items.js';
import { defineJob } from '@/jobs/job-router.js';
import { sendProcessSpApiSyncQueueJob } from '@/services/spapi-sync-queue.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';

const SP_API_SYNC_BATCH_SIZE = 20;

export type ProcessSpApiSyncQueueResult = {
    didWork: boolean;
    marketplaceId: string | null;
    queueCount: number;
    upsertedCount: number;
    hasMore: boolean;
};

export async function processSpApiSyncQueue() {
    const queueItems = await getSpApiSyncQueueItems(SP_API_SYNC_BATCH_SIZE + 1);

    if (queueItems.length === 0) {
        return {
            didWork: false,
            marketplaceId: null,
            queueCount: 0,
            upsertedCount: 0,
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

    // Process products from the selected marketplace
    const fetchedProducts = await searchCatalogItemsByAsins(
        marketplaceId,
        asins,
        'rankwrangler_job_process-spapi-sync-queue'
    );

    if (fetchedProducts.length > 0) {
        for (const productInfo of fetchedProducts) {
            await upsertProductInfo(productInfo);
        }
    }

    await deleteSpApiSyncQueueItems(itemIds);

    if (!hasMore) {
        const remainingItems = await getSpApiSyncQueueItems(1);
        hasMore = remainingItems.length > 0;
    }

    return {
        didWork: true,
        marketplaceId,
        queueCount: queueItemsToProcess.length,
        upsertedCount: fetchedProducts.length,
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
        void job;
        void signal;

        const result = await processSpApiSyncQueue();

        if (result.didWork) {
            log('Processed SP-API sync queue batch', {
                marketplaceId: result.marketplaceId,
                queueCount: result.queueCount,
                upsertedCount: result.upsertedCount,
                hasMore: result.hasMore,
            });
        }

        if (result.hasMore) {
            await sendProcessSpApiSyncQueueJob({ singleton: false });
        }

        return result;
    });
