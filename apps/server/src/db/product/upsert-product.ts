import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import type { ProductInfo } from '@/types/index.js';

// Type for product info without rootCategoryDisplayName (derived from rootCategoryId when retrieved)
type ProductInfoWithoutDisplayName = Omit<ProductInfo, 'rootCategoryDisplayName'>;

// Upsert a single product with root category BSR in the database
export async function upsertProductInfo(productInfo: ProductInfoWithoutDisplayName): Promise<void> {
    try {
        const dateFirstAvailable = productInfo.dateFirstAvailable
            ? new Date(productInfo.dateFirstAvailable)
            : null;

        // Use root category information directly from ProductInfo
        const rootCategoryId = productInfo.rootCategoryId;
        const rootCategoryBsr = productInfo.rootCategoryBsr;

        // Insert or update product with root category info
        await db
            .insert(products)
            .values({
                marketplaceId: productInfo.marketplaceId,
                asin: productInfo.asin,
                dateFirstAvailable,
                thumbnailUrl: productInfo.thumbnailUrl || null,
                title: productInfo.title || null,
                brand: productInfo.brand || null,
                isMerchListing: productInfo.isMerchListing,
                bullet1: productInfo.bullet1,
                bullet2: productInfo.bullet2,
                rootCategoryId,
                rootCategoryBsr,
                lastFetched: new Date(),
            })
            .onConflictDoUpdate({
                target: [products.marketplaceId, products.asin],
                set: {
                    dateFirstAvailable,
                    thumbnailUrl: productInfo.thumbnailUrl || null,
                    title: productInfo.title || null,
                    brand: productInfo.brand || null,
                    isMerchListing: productInfo.isMerchListing,
                    bullet1: productInfo.bullet1,
                    bullet2: productInfo.bullet2,
                    rootCategoryId,
                    rootCategoryBsr,
                    lastFetched: new Date(),
                },
            });
    } catch (error) {
        console.error(`[Product Store] Error storing result for ${productInfo.asin}:`, error);
    }
}
