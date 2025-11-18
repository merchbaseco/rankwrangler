import type { FastifyInstance } from 'fastify';
import { env } from '@/config/env.js';
import { listLicenses } from '@/services/license.js';

export async function registerAdminLicenseListRoute(fastify: FastifyInstance) {
    fastify.get('/api/admin/license/list', async (request, reply) => {
        const { z } = await import('zod');
        
        const listLicensesSchema = z.object({
            adminKey: z.string().min(1)
        });

        try {
            const { adminKey } = listLicensesSchema.parse(request.query);
            
            if (adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key'
                };
            }
            
            const licenses = await listLicenses();
            
            return {
                success: true,
                data: licenses
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

