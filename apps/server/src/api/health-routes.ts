import type { FastifyInstance, FastifyReply } from 'fastify';
import { BUILD_REVISION } from '@/config/build-revision.js';
import { type ServiceHealthResult, serviceHealthFromFailures } from '@/services/service-health.js';

export interface HealthRouteReaders {
    readLiveness: () => Promise<ServiceHealthResult>;
    readServiceHealth: () => Promise<ServiceHealthResult>;
}

type HealthResponseBody = ServiceHealthResult & { readonly revision: string };

export const registerHealthRoutes = (fastify: FastifyInstance, readers: HealthRouteReaders) => {
    fastify.get('/api/health', async (_request, reply) =>
        sendHealth(reply, readers.readServiceHealth)
    );
    fastify.get('/health/live', async (_request, reply) => sendHealth(reply, readers.readLiveness));
};

const sendHealth = async (
    reply: FastifyReply,
    read: HealthRouteReaders['readServiceHealth']
): Promise<HealthResponseBody> => {
    const health = await readOrPostgresFailure(read);
    switch (health.status) {
        case 'ok':
            return { status: 'ok', revision: BUILD_REVISION };
        case 'degraded':
            reply.status(503);
            return { status: 'degraded', failing: [...health.failing], revision: BUILD_REVISION };
        default: {
            const unreachable: never = health;
            return unreachable;
        }
    }
};

const readOrPostgresFailure = async (
    read: HealthRouteReaders['readServiceHealth']
): Promise<ServiceHealthResult> => {
    try {
        return await read();
    } catch (error) {
        console.error('[Health] Health reader failed', error);
        return serviceHealthFromFailures(['postgres']);
    }
};
