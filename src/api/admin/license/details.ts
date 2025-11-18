import type { FastifyInstance } from 'fastify';
import { env } from '@/config/env.js';
import { getLicenseById } from '@/services/license.js';

export async function registerAdminLicenseDetailsRoute(fastify: FastifyInstance) {
    fastify.get('/api/admin/license/details', async (request, reply) => {
        const { z } = await import('zod');
        
        const getLicenseSchema = z.object({
            adminKey: z.string().min(1),
            searchBy: z.enum(['id', 'email', 'key']),
            value: z.string().min(1)
        });

        try {
            const { adminKey, searchBy, value } = getLicenseSchema.parse(request.query);
            
            if (adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key'
                };
            }
            
            const license = await getLicenseById(searchBy, value);
            
            if (!license) {
                reply.status(404);
                return {
                    success: false,
                    error: 'License not found'
                };
            }
            
            return {
                success: true,
                data: license
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

