import type { FastifyInstance } from 'fastify';
import { and, eq, gte } from 'drizzle-orm';
import { requireLicense } from '@/middleware/requireLicense.js';
import { db } from '@/db/index.js';
import { productCache, productRequestQueue } from '@/db/schema.js';

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

                // Check cache first
                const cached = await db
                    .select()
                    .from(productCache)
                    .where(
                        and(
                            eq(productCache.marketplaceId, marketplaceId),
                            eq(productCache.asin, asin),
                            gte(productCache.expiresAt, new Date())
                        )
                    )
                    .limit(1);

                if (cached.length > 0) {
                    const cachedData = cached[0].data;
                    return {
                        success: true,
                        data: cachedData,
                    };
                }

                // Insert into queue
                await db
                    .insert(productRequestQueue)
                    .values({ marketplaceId, asin })
                    .onConflictDoNothing();

                // Poll cache every 200ms for up to 10 seconds
                const maxAttempts = 50;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    const result = await db
                        .select()
                        .from(productCache)
                        .where(
                            and(
                                eq(productCache.marketplaceId, marketplaceId),
                                eq(productCache.asin, asin),
                                gte(productCache.expiresAt, new Date())
                            )
                        )
                        .limit(1);

                    if (result.length > 0) {
                        return {
                            success: true,
                            data: result[0].data,
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

