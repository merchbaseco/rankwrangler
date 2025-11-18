import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products, displayGroups, productRankHistory, systemStats } from '@/db/schema.js';
import { getPacificDateString } from '@/utils/date.js';
import type { ProductInfo } from '@/types/index.js';

// Helper function to track cache hits
async function trackCacheHit() {
    try {
        await db
            .update(systemStats)
            .set({
                totalCacheHits: sql`${systemStats.totalCacheHits} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(systemStats.id, 'current'));
    } catch (error) {
        console.error('[Stats] Failed to track cache hit:', error);
    }
}

// Helper function to upsert display group (find or create)
async function upsertDisplayGroup(category: string, link?: string): Promise<string> {
    const existing = await db
        .select()
        .from(displayGroups)
        .where(
            and(
                eq(displayGroups.category, category),
                link ? eq(displayGroups.link, link) : isNull(displayGroups.link)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        return existing[0].id;
    }

    const [newGroup] = await db
        .insert(displayGroups)
        .values({ category, link: link || null })
        .returning({ id: displayGroups.id });

    return newGroup.id;
}

// Store a single product and its rank history in the database
export async function storeProductInfo(productInfo: ProductInfo): Promise<void> {
    try {
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
        const today = getPacificDateString();
        const creationDate = productInfo.creationDate ? new Date(productInfo.creationDate) : null;

        // Insert or update product
        const [product] = await db
            .insert(products)
            .values({
                marketplaceId: productInfo.marketplaceId,
                asin: productInfo.asin,
                creationDate,
                thumbnailUrl: productInfo.thumbnailUrl || null,
                lastFetched: new Date(),
                expiresAt,
            })
            .onConflictDoUpdate({
                target: [products.marketplaceId, products.asin],
                set: {
                    creationDate,
                    thumbnailUrl: productInfo.thumbnailUrl || null,
                    lastFetched: new Date(),
                    expiresAt,
                    createdAt: new Date(),
                },
            })
            .returning({ id: products.id });

        // Upsert display groups and insert rank history for today
        for (const rank of productInfo.displayGroupRanks) {
            const displayGroupId = await upsertDisplayGroup(rank.category, rank.link);

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

        // Track cache hit
        await trackCacheHit();

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
