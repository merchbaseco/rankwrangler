import type { FastifyInstance } from 'fastify';
import { env } from '@/config/env.js';
import { getLicenseStats } from '@/services/license.js';

export async function registerAdminLicenseStatsRoute(fastify: FastifyInstance) {
    fastify.get('/api/admin/license/stats', async (request, reply) => {
        const { z } = await import('zod');
        
        const adminKeySchema = z.object({
            adminKey: z.string().min(1),
        });

        try {
            const { adminKey } = adminKeySchema.parse(request.query);
            
            if (adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key'
                };
            }
            
            const stats = await getLicenseStats();
            
            return {
                success: true,
                data: stats
            };
        } catch (error) {
            reply.status(400);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Invalid request',
            };
        }
    });
}

