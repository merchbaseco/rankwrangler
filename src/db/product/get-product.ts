import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import { type AmazonRootCategoryId, getDisplayGroupName } from '@/types/amazon-root-categories.js';
import type { ProductInfo } from '@/types/index.js';

// Retrieve product info from store (if exists and not expired)
export async function getProductInfoFromStore(
    marketplaceId: string,
    asin: string
): Promise<ProductInfo | null> {
    try {
        const productRows = await db
            .select()
            .from(products)
            .where(
                and(
                    eq(products.marketplaceId, marketplaceId),
                    eq(products.asin, asin),
                    gte(products.expiresAt, new Date())
                )
            )
            .limit(1);

        if (productRows.length === 0) {
            return null;
        }

        const product = productRows[0];

        // Get the display group name from the root category ID (if available)
        const categoryName =
            product.rootCategoryId !== null
                ? getDisplayGroupName(product.rootCategoryId as AmazonRootCategoryId) || null
                : null;

        // Build displayGroupRanks array with the root category info (if available)
        // If root category data is missing, return empty array
        const displayGroupRanks =
            product.rootCategoryBsr !== null && product.rootCategoryId !== null
                ? [
                      {
                          rank: product.rootCategoryBsr,
                          category: categoryName || '',
                          link: undefined,
                      },
                  ]
                : [];

        return {
            asin: product.asin,
            marketplaceId: product.marketplaceId,
            dateFirstAvailable: product.dateFirstAvailable?.toISOString() || null,
            thumbnailUrl: product.thumbnailUrl || undefined,
            bsr: product.rootCategoryBsr,
            bsrCategory: categoryName,
            displayGroupRanks,
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
