import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import { type AmazonRootCategoryId, getDisplayGroupName } from '@/types/amazon-root-categories.js';
import type { ProductInfo } from '@/types/index.js';

// Retrieve product info from store (if exists and not older than maxAge)
export async function getProductInfoFromStore(
    marketplaceId: string,
    asin: string,
    maxAgeMs: number = 2 * 24 * 60 * 60 * 1000 // Default: 2 days
): Promise<ProductInfo | null> {
    try {
        const minLastFetched = new Date(Date.now() - maxAgeMs);
        const productRows = await db
            .select()
            .from(products)
            .where(
                and(
                    eq(products.marketplaceId, marketplaceId),
                    eq(products.asin, asin),
                    gte(products.lastFetched, minLastFetched)
                )
            )
            .limit(1);

        if (productRows.length === 0) {
            return null;
        }

        const product = productRows[0];

        // Get the display group name from the root category ID (if available)
        const rootCategoryDisplayName =
            product.rootCategoryId !== null
                ? getDisplayGroupName(product.rootCategoryId as AmazonRootCategoryId) || null
                : null;

        return {
            asin: product.asin,
            marketplaceId: product.marketplaceId,
            dateFirstAvailable: product.dateFirstAvailable?.toISOString() || null,
            thumbnailUrl: product.thumbnailUrl || undefined,
            rootCategoryId: product.rootCategoryId,
            rootCategoryBsr: product.rootCategoryBsr,
            rootCategoryDisplayName: rootCategoryDisplayName,
            metadata: {
                lastFetched: product.lastFetched.toISOString(),
                cached: true,
            },
        };
    } catch (error) {
        console.error(`[Product Store] Error checking product store for ${asin}:`, error);
        return null;
    }
}
