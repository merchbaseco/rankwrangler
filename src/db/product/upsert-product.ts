import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import type { ProductInfo } from '@/types/index.js';
import { getRootCategoryId } from '@/types/amazon-root-categories.js';

// Upsert a single product with root category BSR in the database
export async function upsertProductInfo(productInfo: ProductInfo): Promise<void> {
    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
        const dateFirstAvailable = productInfo.dateFirstAvailable ? new Date(productInfo.dateFirstAvailable) : null;

        // Find the root category ID from the first display group rank (already sorted by rank)
        // The first rank is typically the best/most relevant one
        let rootCategoryId: number | null = null;
        let rootCategoryBsr: number | null = null;

        if (productInfo.displayGroupRanks.length > 0) {
            const firstRank = productInfo.displayGroupRanks[0];
            const categoryId = getRootCategoryId(firstRank.category);
            
            if (categoryId !== undefined) {
                rootCategoryId = categoryId;
                rootCategoryBsr = firstRank.rank;
            }
        }

        // Insert or update product with root category info
        await db
            .insert(products)
            .values({
                marketplaceId: productInfo.marketplaceId,
                asin: productInfo.asin,
                dateFirstAvailable,
                thumbnailUrl: productInfo.thumbnailUrl || null,
                rootCategoryId,
                rootCategoryBsr,
                lastFetched: new Date(),
                expiresAt,
            })
            .onConflictDoUpdate({
                target: [products.marketplaceId, products.asin],
                set: {
                    dateFirstAvailable,
                    thumbnailUrl: productInfo.thumbnailUrl || null,
                    rootCategoryId,
                    rootCategoryBsr,
                    lastFetched: new Date(),
                    expiresAt,
                },
            });

        console.log(`[${new Date().toISOString()}] Stored product result for ${productInfo.asin}`);
    } catch (error) {
        console.error(`[Product Store] Error storing result for ${productInfo.asin}:`, error);
    }
}

