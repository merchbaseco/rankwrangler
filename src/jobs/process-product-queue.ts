import { storeProductInfo } from '@/db/product/store-product.js';
import { getQueueItems } from '@/db/product-ingest-queue/get-queue-items.js';
import { deleteQueueItems } from '@/db/product-ingest-queue/delete-queue-items.js';
import { getProductInfoBulk } from '@/services/spapi.js';

export async function processProductQueue() {
    const queueItems = await getQueueItems(20);

    if (queueItems.length === 0) {
        return;
    }

    const groupedByMarketplace = new Map<string, string[]>();
    const itemIds: string[] = [];

    for (const item of queueItems) {
        if (!groupedByMarketplace.has(item.marketplaceId)) {
            groupedByMarketplace.set(item.marketplaceId, []);
        }
        groupedByMarketplace.get(item.marketplaceId)!.push(item.asin);
        itemIds.push(item.id);
    }

    for (const [marketplaceId, asins] of groupedByMarketplace) {
        const { products: fetchedProducts } = await getProductInfoBulk(marketplaceId, asins, { 
            trackStats: true,
            userEmail: null // Background job, no user context
        });
        
        if (fetchedProducts.length > 0) {
            for (const productInfo of fetchedProducts) {
                await storeProductInfo(productInfo);
            }
        }
    }

    await deleteQueueItems(itemIds);
    console.log(`[Queue] Processed ${itemIds.length} queue items`);
}

