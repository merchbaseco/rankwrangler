import { upsertProductInfo } from '@/db/product/upsert-product.js';
import { deleteQueueItems } from '@/db/product-ingest-queue/delete-queue-items.js';
import { getQueueItems } from '@/db/product-ingest-queue/get-queue-items.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';

export type ProcessProductIngestQueueResult = {
    didWork: boolean;
    marketplaceId: string | null;
    queueCount: number;
    upsertedCount: number;
};

export async function processProductIngestQueue() {
    const queueItems = await getQueueItems(20);

    if (queueItems.length === 0) {
        return {
            didWork: false,
            marketplaceId: null,
            queueCount: 0,
            upsertedCount: 0,
        } satisfies ProcessProductIngestQueueResult;
    }

    // All items are guaranteed to be from the same marketplace (handled by getQueueItems)
    const marketplaceId = queueItems[0].marketplaceId;
    const asins = queueItems.map(item => item.asin);
    const itemIds = queueItems.map(item => item.id);

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

    return {
        didWork: true,
        marketplaceId,
        queueCount: queueItems.length,
        upsertedCount: fetchedProducts.length,
    } satisfies ProcessProductIngestQueueResult;
}
