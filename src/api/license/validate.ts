import type { FastifyInstance } from 'fastify';
import { validateLicense } from '@/services/license.js';

export async function registerLicenseValidateRoute(fastify: FastifyInstance) {
    fastify.post('/api/license/validate', async (request, reply) => {
        const { z } = await import('zod');
        
        const validateLicenseSchema = z.object({
            licenseKey: z.string().min(1, 'License key is required'),
        });

        try {
            const { licenseKey } = validateLicenseSchema.parse(request.body);
            const validation = await validateLicense(licenseKey);
            
            if (validation.valid) {
                return {
                    success: true,
                    data: validation.data
                };
            } else {
                reply.status(401);
                return {
                    success: false,
                    error: validation.error
                };
            }
        } catch (error) {
            reply.status(400);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Invalid request',
            };
        }
    });
}

