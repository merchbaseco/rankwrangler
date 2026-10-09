import type { FastifyInstance, FastifyReply } from 'fastify';
import { type ServiceHealthResult, serviceHealthFromFailures } from '@/services/service-health.js';

export interface HealthRouteReaders {
    readLiveness: () => Promise<ServiceHealthResult>;
    readServiceHealth: () => Promise<ServiceHealthResult>;
}

export const registerHealthRoutes = (fastify: FastifyInstance, readers: HealthRouteReaders) => {
    fastify.get('/api/health', async (_request, reply) =>
        sendHealth(reply, readers.readServiceHealth)
    );
    fastify.get('/health/live', async (_request, reply) => sendHealth(reply, readers.readLiveness));
};

const sendHealth = async (reply: FastifyReply, read: HealthRouteReaders['readServiceHealth']) => {
    try {
        const health = await read();
        switch (health.status) {
            case 'ok':
                return { status: 'ok' };
            case 'degraded':
                reply.status(503);
                return { status: 'degraded', failing: [...health.failing] };
            default: {
                const unreachable: never = health;
                return unreachable;
            }
        }
    } catch (error) {
        console.error('[Health] Health reader failed', error);
        reply.status(503);
        return serviceHealthFromFailures(['postgres']);
    }
};
