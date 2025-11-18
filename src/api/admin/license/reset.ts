import type { FastifyInstance } from 'fastify';
import { env } from '@/config/env.js';
import { resetLicenseUsage } from '@/services/license.js';

export async function registerAdminLicenseResetRoute(fastify: FastifyInstance) {
    fastify.post('/api/admin/license/reset', async (request, reply) => {
        const { z } = await import('zod');
        
        const resetUsageSchema = z.object({
            adminKey: z.string().min(1),
            licenseId: z.string().min(1)
        });

        try {
            const { adminKey, licenseId } = resetUsageSchema.parse(request.body);
            
            if (adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key'
                };
            }
            
            const success = await resetLicenseUsage(licenseId);
            
            if (!success) {
                reply.status(404);
                return {
                    success: false,
                    error: 'License not found'
                };
            }
            
            console.log(`[Admin] Reset usage for license ID: ${licenseId}`);
            
            return {
                success: true,
                message: 'License usage reset successfully'
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

