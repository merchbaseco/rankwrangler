import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { mapStoredProductInfo } from '@/db/product/product-info-mapper';
import { products } from '@/db/schema.js';
import type { ProductInfo } from '@/types/index.js';

// Retrieve product info from store (if exists and not older than maxAge)
export async function getProductInfoFromStore(
    marketplaceId: string,
    asin: string,
    maxAgeMs: number = 2 * 24 * 60 * 60 * 1000 // Default: 2 days
): Promise<ProductInfo | null> {
    try {
        const minimumFetchedAt = new Date(Date.now() - maxAgeMs);
        const productRows = await db
            .select()
            .from(products)
            .where(
                and(
                    eq(products.marketplaceId, marketplaceId),
                    eq(products.asin, asin),
                    gte(products.spApiFetchedAt, minimumFetchedAt)
                )
            )
            .limit(1);

        if (productRows.length === 0) {
            return null;
        }

        return mapStoredProductInfo(productRows[0]);
    } catch (error) {
        console.error(`[Product Store] Error checking product store for ${asin}:`, error);
        return null;
    }
}
