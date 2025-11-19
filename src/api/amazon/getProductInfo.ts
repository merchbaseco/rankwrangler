import type { FastifyInstance } from 'fastify';
import { requireLicense } from '@/middleware/requireLicense.js';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';
import { trackApiRequest } from '@/services/posthog.js';

export async function registerAmazonGetProductInfoRoute(fastify: FastifyInstance) {
    fastify.post(
        '/api/amazon/getProductInfo',
        {
            preHandler: requireLicense,
        },
        async (request, reply) => {
            const { z } = await import('zod');

            const getProductInfoSchema = z.object({
                marketplaceId: z.string().min(1, 'Marketplace ID is required'),
                asins: z
                    .array(
                        z
                            .string()
                            .min(1, 'ASIN is required')
                            .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
                            .transform(value => value.toUpperCase())
                    )
                    .min(1, 'At least one ASIN is required')
                    .max(20, 'You can request up to 20 ASINs at a time'),
            });

            try {
                const validatedData = getProductInfoSchema.parse(request.body);
                const uniqueAsins = Array.from(new Set(validatedData.asins));
                const caller = request.license?.email || 'anonymous';

                // Track API request
                trackApiRequest({
                    uid: caller,
                    endpoint: '/api/amazon/getProductInfo',
                    marketplaceId: validatedData.marketplaceId,
                    asins: uniqueAsins,
                    cached: false,
                });

                console.log(
                    `[${new Date().toISOString()}] Getting product info from SP-API for ${uniqueAsins.length} ASIN(s): ${uniqueAsins.join(', ')}`
                );

                // Use searchCatalogItemsByAsins with user context
                const { products, missing } = await searchCatalogItemsByAsins(
                    validatedData.marketplaceId,
                    uniqueAsins,
                    caller
                );

                // If only one ASIN was requested, return single product for backward compatibility
                if (uniqueAsins.length === 1) {
                    if (products.length === 0) {
                        reply.status(404);
                        return {
                            success: false,
                            error: 'Product not found',
                        };
                    }
                    return {
                        success: true,
                        data: products[0],
                    };
                }

                return {
                    success: true,
                    data: products,
                    ...(missing.length > 0 ? { missing } : {}),
                };
            } catch (error) {
                const { z: zod } = await import('zod');
                if (error instanceof zod.ZodError) {
                    reply.status(400);
                    return {
                        success: false,
                        error: error.issues.map(issue => issue.message).join(', '),
                    };
                }

                console.error(
                    `[${new Date().toISOString()}] Error getting product info from SP-API:`,
                    error
                );
                reply.status(500);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error occurred',
                };
            }
        }
    );
}

