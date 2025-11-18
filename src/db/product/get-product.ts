import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products, displayGroups, productRankHistory } from '@/db/schema.js';
import { getPacificDateString } from '@/utils/date.js';
import type { ProductInfo } from '@/types/index.js';

// Retrieve product info from store (if exists and has today's rank history)
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
        const today = getPacificDateString();

        // Get today's rank history for this product
        const rankHistory = await db
            .select({
                rank: productRankHistory.bsr,
                category: displayGroups.category,
                link: displayGroups.link,
            })
            .from(productRankHistory)
            .innerJoin(displayGroups, eq(productRankHistory.displayGroupId, displayGroups.id))
            .where(
                and(
                    eq(productRankHistory.productId, product.id),
                    eq(productRankHistory.date, today)
                )
            )
            .orderBy(productRankHistory.bsr);

        // If rank history doesn't exist for today's Pacific date, return null (cache miss)
        if (rankHistory.length === 0) {
            return null;
        }

        const displayGroupRanks = rankHistory.map(rh => ({
            rank: rh.rank,
            category: rh.category,
            link: rh.link || undefined,
        }));

        const bsr = displayGroupRanks.length > 0 ? displayGroupRanks[0].rank : null;
        const bsrCategory = displayGroupRanks.length > 0 ? displayGroupRanks[0].category : null;

        return {
            asin: product.asin,
            marketplaceId: product.marketplaceId,
            creationDate: product.creationDate?.toISOString() || null,
            thumbnailUrl: product.thumbnailUrl || undefined,
            bsr,
            bsrCategory,
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

