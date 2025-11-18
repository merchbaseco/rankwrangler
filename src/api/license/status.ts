import type { FastifyInstance } from 'fastify';
import { requireLicense } from '@/middleware/requireLicense.js';

export async function registerLicenseStatusRoute(fastify: FastifyInstance) {
    fastify.get('/api/license/status', {
        preHandler: requireLicense
    }, async (request, reply) => {
        return {
            success: true,
            data: request.license
        };
    });
}

