import { and, eq, gte, isNotNull, lt, or } from 'drizzle-orm';
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

export async function reprocessStaleProducts() {
    const now = new Date();
    const threshold24Hours = new Date(now.getTime() - HOURS_24);
    const threshold7Days = new Date(now.getTime() - DAYS_7);
    const threshold30Days = new Date(now.getTime() - DAYS_30);

    // Find stale products with root category "Clothing, Shoes & Jewelry"
    // Using tiered logic based on BSR:
    // - BSR < 800k: requeue if lastFetched > 24 hours ago
    // - BSR < 2M: requeue if lastFetched > 7 days ago
    // - All other BSRs: requeue if lastFetched > 30 days ago
    const staleProducts = await db
        .select({
            marketplaceId: products.marketplaceId,
            asin: products.asin,
        })
        .from(products)
        .where(
            and(
                eq(products.rootCategoryId, CLOTHING_SHOES_JEWELRY_CATEGORY_ID),
                isNotNull(products.rootCategoryBsr),
                or(
                    // BSR < 800k: requeue if lastFetched > 24 hours ago
                    and(
                        lt(products.rootCategoryBsr, BSR_THRESHOLD_800K),
                        lt(products.lastFetched, threshold24Hours)
                    ),
                    // BSR < 2M (but >= 800k): requeue if lastFetched > 7 days ago
                    and(
                        gte(products.rootCategoryBsr, BSR_THRESHOLD_800K),
                        lt(products.rootCategoryBsr, BSR_THRESHOLD_2M),
                        lt(products.lastFetched, threshold7Days)
                    ),
                    // BSR >= 2M: requeue if lastFetched > 30 days ago
                    and(
                        gte(products.rootCategoryBsr, BSR_THRESHOLD_2M),
                        lt(products.lastFetched, threshold30Days)
                    )
                )
            )
        );

    if (staleProducts.length === 0) {
        console.log('[Reprocess Stale Products] No stale products found');
        return;
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

        console.log(
            `[Reprocess Stale Products] Added ${staleProducts.length} stale products to ingest queue`
        );
    } catch (error) {
        console.error('[Reprocess Stale Products] Error adding products to queue:', error);
    }
}

