import type { FastifyInstance } from 'fastify';
import { env } from '@/config/env.js';
import { createLicense } from '@/services/license.js';

export async function registerAdminLicenseGenerateRoute(fastify: FastifyInstance) {
    fastify.post('/api/admin/license/generate', async (request, reply) => {
        const { z } = await import('zod');
        
        const generateLicenseSchema = z.object({
            email: z.string().email('Valid email is required'),
            adminKey: z.string().min(1, 'Admin key is required'),
            unlimited: z.boolean().optional().default(false),
        });

        try {
            const validatedData = generateLicenseSchema.parse(request.body);
            
            // Simple admin authentication (you might want to improve this)
            if (validatedData.adminKey !== env.LICENSE_SECRET) {
                reply.status(401);
                return {
                    success: false,
                    error: 'Invalid admin key'
                };
            }
            
            const license = await createLicense(
                validatedData.email,
                validatedData.unlimited
            );
            
            console.log(`[Admin] Generated license for ${validatedData.email}`);
            
            return {
                success: true,
                data: {
                    licenseKey: license.key,
                    email: license.email
                }
            };
        } catch (error) {
            console.error(`[Admin] Error generating license:`, error);
            reply.status(400);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Invalid request',
            };
        }
    });
}

