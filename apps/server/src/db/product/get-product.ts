import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { mapStoredProductInfo } from '@/db/product/product-info-mapper';
import { products, spApiSyncQueue } from '@/db/schema.js';
import type { ProductInfo } from '@/types/index.js';

export const getStoredProductByIdentity = async (
    marketplaceId: string,
    asin: string
): Promise<{ product: ProductInfo; syncPending: boolean } | null> => {
    const [row] = await db
        .select({
            product: products,
            syncQueueId: spApiSyncQueue.id,
        })
        .from(products)
        .leftJoin(
            spApiSyncQueue,
            and(
                eq(spApiSyncQueue.marketplaceId, products.marketplaceId),
                eq(spApiSyncQueue.asin, products.asin)
            )
        )
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)))
        .limit(1);

    return row
        ? {
              product: mapStoredProductInfo(row.product),
              syncPending: row.syncQueueId !== null,
          }
        : null;
};

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
