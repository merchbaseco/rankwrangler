import type { FastifyReply, FastifyRequest } from 'fastify';
import { validateLicense } from '@/services/license.js';

// Extend Fastify request type to include license data
declare module 'fastify' {
    interface FastifyRequest {
        license?: {
            email: string;
            usageToday: number;
            dailyLimit: number;
        };
    }
}

export const requireLicense = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({
            success: false,
            error: 'No license key provided. Please add your license key in the extension settings.',
        });
    }

    const token = authHeader.substring(7);
    const validation = await validateLicense(token);

    if (!validation.valid) {
        return reply.status(401).send({
            success: false,
            error: validation.error,
        });
    }

    // Attach license info to request for use in handlers
    request.license = validation.data!;

    // Log license usage for monitoring
    console.log(
        `[License] ${validation.data!.email} - ${validation.data!.usageToday}/${validation.data!.dailyLimit} requests today`
    );
};
