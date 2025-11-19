import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { env } from '@/config/env.js';
import { db } from '@/db/index.js';

export async function registerAdminCacheClearRoute(fastify: FastifyInstance) {
    fastify.post('/api/admin/cache/clear', async (request, reply) => {
        const { z } = await import('zod');

        const clearCacheSchema = z.object({
            adminKey: z.string().min(1, 'Admin key is required'),
        });

        try {
            const { adminKey } = clearCacheSchema.parse(request.body);

            if (adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key',
                };
            }

            // Clear all products
            const { products } = await import('@/db/schema.js');

            // First get count before deleting
            const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(products);
            const countBefore = countResult.count;

            // Delete all product entries
            await db.delete(products);

            console.log(`[Admin] Cleared products: ${countBefore} entries removed`);

            return {
                success: true,
                data: {
                    clearedCount: countBefore,
                },
            };
        } catch (error) {
            console.error(`[Admin] Error clearing cache:`, error);
            reply.status(400);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Invalid request',
            };
        }
    });
}


