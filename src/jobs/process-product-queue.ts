import { inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { productRequestQueue } from '@/db/schema.js';
import { storeProductInfoBulk } from '@/db/products.js';

export async function processProductQueue() {
    const queueItems = await db
        .select()
        .from(productRequestQueue)
        .orderBy(productRequestQueue.createdAt)
        .limit(20);

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

    const { getProductInfoBulk } = await import('@/services/spapi.js');

    for (const [marketplaceId, asins] of groupedByMarketplace) {
        // Call SP-API to fetch product info
        const { products: fetchedProducts } = await getProductInfoBulk(marketplaceId, asins);
        
        // Store the fetched products in the database
        if (fetchedProducts.length > 0) {
            await storeProductInfoBulk(fetchedProducts);
        }
    }

    await db.delete(productRequestQueue).where(inArray(productRequestQueue.id, itemIds));
    console.log(`[Queue] Processed ${itemIds.length} queue items`);
}

