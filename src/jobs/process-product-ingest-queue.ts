import { upsertProductInfo } from '@/db/product/upsert-product.js';
import { deleteQueueItems } from '@/db/product-ingest-queue/delete-queue-items.js';
import { getQueueItems } from '@/db/product-ingest-queue/get-queue-items.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';

export async function processProductIngestQueue() {
    const queueItems = await getQueueItems(20);

    if (queueItems.length === 0) {
        return;
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
    console.log(
        `[Queue] Processed ${itemIds.length} queue items from marketplace ${marketplaceId}`
    );
}
