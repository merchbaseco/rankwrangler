import type { FastifyInstance } from 'fastify';
import { and, eq, gte } from 'drizzle-orm';
import { requireLicense } from '@/middleware/requireLicense.js';
import { db } from '@/db/index.js';
import { products, displayGroups, productRankHistory, productRequestQueue } from '@/db/schema.js';
import type { ProductInfo } from '@/types/index.js';
import { getPacificDateString } from '@/utils/date.js';

export async function registerGetProductInfoRoute(fastify: FastifyInstance) {
    fastify.post(
        '/api/getProductInfo',
        {
            preHandler: requireLicense,
        },
        async (request, reply) => {
            const { z } = await import('zod');

            const getProductInfoSchema = z.object({
                marketplaceId: z.string().min(1, 'Marketplace ID is required'),
                asin: z.string().min(1, 'ASIN is required'),
            });

            try {
                const validatedData = getProductInfoSchema.parse(request.body);
                const { marketplaceId, asin } = validatedData;

                // Check product store first
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

                if (productRows.length > 0) {
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

                    const displayGroupRanks = rankHistory.map(rh => ({
                        rank: rh.rank,
                        category: rh.category,
                        link: rh.link || undefined,
                    }));

                    const bsr = displayGroupRanks.length > 0 ? displayGroupRanks[0].rank : null;
                    const bsrCategory = displayGroupRanks.length > 0 ? displayGroupRanks[0].category : null;

                    const productInfo: ProductInfo = {
                        asin: product.asin,
                        marketplaceId: product.marketplaceId,
                        creationDate: product.creationDate?.toISOString() || null,
                        bsr,
                        bsrCategory,
                        displayGroupRanks,
                        metadata: {
                            lastFetched: product.lastFetched.toISOString(),
                            cached: true,
                        },
                    };

                    return {
                        success: true,
                        data: productInfo,
                    };
                }

                // Insert into queue
                await db
                    .insert(productRequestQueue)
                    .values({ marketplaceId, asin })
                    .onConflictDoNothing();

                // Poll product store every 200ms for up to 10 seconds
                const maxAttempts = 50;
                const today = getPacificDateString();
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 200));

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

                    if (productRows.length > 0) {
                        const product = productRows[0];

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

                        const displayGroupRanks = rankHistory.map(rh => ({
                            rank: rh.rank,
                            category: rh.category,
                            link: rh.link || undefined,
                        }));

                        const bsr = displayGroupRanks.length > 0 ? displayGroupRanks[0].rank : null;
                        const bsrCategory = displayGroupRanks.length > 0 ? displayGroupRanks[0].category : null;

                        const productInfo: ProductInfo = {
                            asin: product.asin,
                            marketplaceId: product.marketplaceId,
                            creationDate: product.creationDate?.toISOString() || null,
                            bsr,
                            bsrCategory,
                            displayGroupRanks,
                            metadata: {
                                lastFetched: product.lastFetched.toISOString(),
                                cached: true,
                            },
                        };

                        return {
                            success: true,
                            data: productInfo,
                        };
                    }
                }

                reply.status(504);
                return {
                    success: false,
                    error: 'Request timeout: product info not available after 10 seconds',
                };
            } catch (error) {
                console.error(
                    `[${new Date().toISOString()}] Error getting product info:`,
                    error
                );

                const { z: zod } = await import('zod');
                if (error instanceof zod.ZodError) {
                    reply.status(400);
                    return {
                        success: false,
                        error: error.issues.map(issue => issue.message).join(', '),
                    };
                }

                reply.status(500);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error occurred',
                };
            }
        }
    );
}

