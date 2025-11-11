import type { FastifyInstance } from 'fastify';
import { requireLicense } from '@/middleware/requireLicense.js';
import { getProductInfoFromSpApi } from '@/services/spapi.js';

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
                asin: z.string().min(1, 'ASIN is required'),
            });

            try {
                const validatedData = getProductInfoSchema.parse(request.body);
                const { marketplaceId, asin } = validatedData;

                console.log(
                    `[${new Date().toISOString()}] Getting product info from SP-API for ${asin}`
                );

                const productInfo = await getProductInfoFromSpApi(marketplaceId, asin);

                return {
                    success: true,
                    data: productInfo,
                };
            } catch (error) {
                console.error(
                    `[${new Date().toISOString()}] Error getting product info from SP-API:`,
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

