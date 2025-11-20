import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { getProductInfoFromStore } from '@/db/product/get-product.js';
import { productIngestQueue } from '@/db/schema.js';
import { requireLicense } from '@/middleware/requireLicense.js';
import { trackApiRequest } from '@/services/posthog.js';

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
                asin: z
                    .string()
                    .min(1, 'ASIN is required')
                    .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
                    .transform(value => value.toUpperCase()),
            });

            try {
                const validatedData = getProductInfoSchema.parse(request.body);
                const { marketplaceId, asin } = validatedData;
                const uid = request.license?.email || 'anonymous';

                // Track API request
                trackApiRequest({
                    uid,
                    endpoint: '/api/getProductInfo',
                    marketplaceId,
                    asin,
                });

                // Check product store first
                const cachedProduct = await getProductInfoFromStore(marketplaceId, asin);
                if (cachedProduct) {
                    return {
                        success: true,
                        data: cachedProduct,
                    };
                }

                // Insert into queue
                await db
                    .insert(productIngestQueue)
                    .values({ marketplaceId, asin })
                    .onConflictDoNothing();

                // Poll product store every 200ms for up to 10 seconds
                const maxAttempts = 50;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    const polledProduct = await getProductInfoFromStore(marketplaceId, asin);
                    if (polledProduct) {
                        return {
                            success: true,
                            data: polledProduct,
                        };
                    }
                }

                reply.status(504);
                return {
                    success: false,
                    error: 'Request timeout: product info not available after 10 seconds',
                };
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Error getting product info:`, error);

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
