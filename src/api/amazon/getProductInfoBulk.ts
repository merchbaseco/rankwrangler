import type { FastifyInstance } from 'fastify';
import { requireLicense } from '@/middleware/requireLicense.js';
import { getProductInfoBulkFromSpApi } from '@/services/spapi.js';

export async function registerGetProductInfoBulkRoute(fastify: FastifyInstance) {
    fastify.post(
        '/api/amazon/getProductInfoBulk',
        {
            preHandler: requireLicense,
        },
        async (request, reply) => {
            const { z } = await import('zod');

            const getProductInfoBulkSchema = z.object({
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
                const validatedData = getProductInfoBulkSchema.parse(request.body);
                const uniqueAsins = Array.from(new Set(validatedData.asins));

                console.log(
                    `[${new Date().toISOString()}] Getting bulk product info from SP-API for ${uniqueAsins.length} ASINs: ${uniqueAsins.join(', ')}`
                );

                const { products, missing } = await getProductInfoBulkFromSpApi(
                    validatedData.marketplaceId,
                    uniqueAsins
                );

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
                    `[${new Date().toISOString()}] Error getting bulk product info from SP-API:`,
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

