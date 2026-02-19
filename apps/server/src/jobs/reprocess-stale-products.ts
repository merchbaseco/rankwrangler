import { and, eq, gte, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { productIngestQueue, products } from '@/db/schema.js';

// Root category ID for "Clothing, Shoes & Jewelry"
const CLOTHING_SHOES_JEWELRY_CATEGORY_ID = 7141123011;

// BSR thresholds
const BSR_THRESHOLD_800K = 800000;
const BSR_THRESHOLD_2M = 2000000;

// Time thresholds in milliseconds
const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

export type ReprocessStaleProductsResult = {
    didWork: boolean;
    staleProductCount: number;
    enqueuedCount: number;
    errorMessage: string | null;
};

export async function reprocessStaleProducts() {
    const now = new Date();
    const threshold24Hours = new Date(now.getTime() - HOURS_24);
    const threshold7Days = new Date(now.getTime() - DAYS_7);
    const threshold30Days = new Date(now.getTime() - DAYS_30);

    // Find stale products:
    // 1. Products with root category "Clothing, Shoes & Jewelry" using tiered logic based on BSR:
    //    - BSR < 800k: requeue if lastFetched > 24 hours ago
    //    - BSR < 2M: requeue if lastFetched > 7 days ago
    //    - BSR >= 2M or null BSR: requeue if lastFetched > 30 days ago
    // 2. Products with null root category ID: requeue if lastFetched > 24 hours ago
    //    (assumed to have had an error and should be refreshed daily)
    const staleProducts = await db
        .select({
            marketplaceId: products.marketplaceId,
            asin: products.asin,
        })
        .from(products)
        .where(
            or(
                // Products with root category "Clothing, Shoes & Jewelry" using tiered logic
                and(
                    eq(products.rootCategoryId, CLOTHING_SHOES_JEWELRY_CATEGORY_ID),
                    or(
                        // BSR < 800k: requeue if lastFetched > 24 hours ago
                        and(
                            isNotNull(products.rootCategoryBsr),
                            lt(products.rootCategoryBsr, BSR_THRESHOLD_800K),
                            lt(products.lastFetched, threshold24Hours)
                        ),
                        // BSR < 2M (but >= 800k): requeue if lastFetched > 7 days ago
                        and(
                            isNotNull(products.rootCategoryBsr),
                            gte(products.rootCategoryBsr, BSR_THRESHOLD_800K),
                            lt(products.rootCategoryBsr, BSR_THRESHOLD_2M),
                            lt(products.lastFetched, threshold7Days)
                        ),
                        // BSR >= 2M: requeue if lastFetched > 30 days ago
                        and(
                            isNotNull(products.rootCategoryBsr),
                            gte(products.rootCategoryBsr, BSR_THRESHOLD_2M),
                            lt(products.lastFetched, threshold30Days)
                        ),
                        // Null BSR: requeue if lastFetched > 30 days ago (treated like BSR >= 2M)
                        and(
                            isNull(products.rootCategoryBsr),
                            lt(products.lastFetched, threshold30Days)
                        )
                    )
                ),
                // Products with null root category ID: refresh once per day
                and(isNull(products.rootCategoryId), lt(products.lastFetched, threshold24Hours))
            )
        );

    if (staleProducts.length === 0) {
        return {
            didWork: false,
            staleProductCount: 0,
            enqueuedCount: 0,
            errorMessage: null,
        } satisfies ReprocessStaleProductsResult;
    }

    // Add stale products to ingest queue (using onConflictDoNothing to avoid duplicates)
    try {
        await db
            .insert(productIngestQueue)
            .values(
                staleProducts.map(product => ({
                    marketplaceId: product.marketplaceId,
                    asin: product.asin,
                }))
            )
            .onConflictDoNothing();

        return {
            didWork: true,
            staleProductCount: staleProducts.length,
            enqueuedCount: staleProducts.length,
            errorMessage: null,
        } satisfies ReprocessStaleProductsResult;
    } catch (error) {
        console.error('[Reprocess Stale Products] Error adding products to queue:', error);

        return {
            didWork: true,
            staleProductCount: staleProducts.length,
            enqueuedCount: 0,
            errorMessage:
                error instanceof Error
                    ? error.message
                    : 'Failed to enqueue stale products',
        } satisfies ReprocessStaleProductsResult;
    }
}
