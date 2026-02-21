import { z } from 'zod';
import { upsertProductInfo } from '@/db/product/upsert-product.js';
import { deleteQueueItems } from '@/db/product-ingest-queue/delete-queue-items.js';
import { getQueueItems } from '@/db/product-ingest-queue/get-queue-items.js';
import { defineJob } from '@/jobs/job-router.js';
import { sendProcessProductIngestQueueJob } from '@/services/product-ingest-queue.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';

const PRODUCT_INGEST_BATCH_SIZE = 20;

export type ProcessProductIngestQueueResult = {
    didWork: boolean;
    marketplaceId: string | null;
    queueCount: number;
    upsertedCount: number;
    hasMore: boolean;
};

export async function processProductIngestQueue() {
    const queueItems = await getQueueItems(PRODUCT_INGEST_BATCH_SIZE + 1);

    if (queueItems.length === 0) {
        return {
            didWork: false,
            marketplaceId: null,
            queueCount: 0,
            upsertedCount: 0,
            hasMore: false,
        } satisfies ProcessProductIngestQueueResult;
    }

    let hasMore = queueItems.length > PRODUCT_INGEST_BATCH_SIZE;
    const queueItemsToProcess = hasMore
        ? queueItems.slice(0, PRODUCT_INGEST_BATCH_SIZE)
        : queueItems;
    const marketplaceId = queueItemsToProcess[0].marketplaceId;
    const asins = queueItemsToProcess.map(item => item.asin);
    const itemIds = queueItemsToProcess.map(item => item.id);

    // Process products from the selected marketplace
    const fetchedProducts = await searchCatalogItemsByAsins(
        marketplaceId,
        asins,
        'rankwrangler_job_process-product-ingest-queue'
    );

    if (fetchedProducts.length > 0) {
        for (const productInfo of fetchedProducts) {
            await upsertProductInfo(productInfo);
        }
    }

    await deleteQueueItems(itemIds);

    if (!hasMore) {
        const remainingItems = await getQueueItems(1);
        hasMore = remainingItems.length > 0;
    }

    return {
        didWork: true,
        marketplaceId,
        queueCount: queueItemsToProcess.length,
        upsertedCount: fetchedProducts.length,
        hasMore,
    } satisfies ProcessProductIngestQueueResult;
}

export const processProductIngestQueueJob = defineJob(
    'process-product-ingest-queue',
    {
        persistSuccess: 'didWork',
        startupSummary: 'event-driven, singleton + startup kick',
    }
)
    .input(z.record(z.string(), z.unknown()))
    .options({
        singletonKey: 'process-product-ingest-queue',
        retryLimit: 0,
    })
    .work(async (job, signal, log) => {
        void job;
        void signal;

        const result = await processProductIngestQueue();

        if (result.didWork) {
            log('Processed product ingest queue batch', {
                marketplaceId: result.marketplaceId,
                queueCount: result.queueCount,
                upsertedCount: result.upsertedCount,
                hasMore: result.hasMore,
            });
        }

        if (result.hasMore) {
            await sendProcessProductIngestQueueJob({ singleton: false });
        }

        return result;
    });
