import type { FastifyInstance } from 'fastify';
import { env } from '@/config/env.js';
import { deleteLicense } from '@/services/license.js';

export async function registerAdminLicenseDeleteRoute(fastify: FastifyInstance) {
    fastify.post('/api/admin/license/delete', async (request, reply) => {
        const { z } = await import('zod');
        
        const deleteLicenseSchema = z.object({
            adminKey: z.string().min(1),
            licenseId: z.string().min(1)
        });

        try {
            const { adminKey, licenseId } = deleteLicenseSchema.parse(request.body);
            
            if (adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key'
                };
            }
            
            const success = await deleteLicense(licenseId);
            
            if (!success) {
                reply.status(404);
                return {
                    success: false,
                    error: 'License not found'
                };
            }
            
            console.log(`[Admin] Deleted license ID: ${licenseId}`);
            
            return {
                success: true,
                message: 'License deleted successfully'
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

