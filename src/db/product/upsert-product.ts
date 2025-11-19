import { db } from '@/db/index.js';
import { products, productRankHistory } from '@/db/schema.js';
import { getPacificDateString } from '@/utils/date.js';
import type { ProductInfo } from '@/types/index.js';
import { findOrCreateDisplayGroup } from '@/db/display-group/find-or-create-display-group.js';

// Upsert a single product and its rank history in the database
export async function upsertProductInfo(productInfo: ProductInfo): Promise<void> {
    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
        const today = getPacificDateString();
        const dateFirstAvailable = productInfo.dateFirstAvailable ? new Date(productInfo.dateFirstAvailable) : null;

        // Insert or update product
        const [product] = await db
            .insert(products)
            .values({
                marketplaceId: productInfo.marketplaceId,
                asin: productInfo.asin,
                dateFirstAvailable,
                thumbnailUrl: productInfo.thumbnailUrl || null,
                lastFetched: new Date(),
                expiresAt,
            })
            .onConflictDoUpdate({
                target: [products.marketplaceId, products.asin],
                set: {
                    dateFirstAvailable,
                    thumbnailUrl: productInfo.thumbnailUrl || null,
                    lastFetched: new Date(),
                    expiresAt,
                    createdAt: new Date(),
                },
            })
            .returning({ id: products.id });

        // Upsert display groups and insert rank history for today
        for (const rank of productInfo.displayGroupRanks) {
            const displayGroupId = await findOrCreateDisplayGroup(rank.category, rank.link);

            // Insert rank history for today (on conflict, update)
            await db
                .insert(productRankHistory)
                .values({
                    productId: product.id,
                    displayGroupId,
                    date: today,
                    bsr: rank.rank,
                })
                .onConflictDoUpdate({
                    target: [
                        productRankHistory.productId,
                        productRankHistory.displayGroupId,
                        productRankHistory.date,
                    ],
                    set: {
                        bsr: rank.rank,
                    },
                });
        }

        console.log(`[${new Date().toISOString()}] Stored product result for ${productInfo.asin}`);
    } catch (error) {
        console.error(`[Product Store] Error storing result for ${productInfo.asin}:`, error);
    }
}

