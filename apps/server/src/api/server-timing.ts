import type { FastifyInstance, FastifyRequest } from 'fastify';

const startedAt = new WeakMap<object, number>();
const authMs = new WeakMap<object, number>();

/**
 * Adds `Server-Timing: auth;dur=…, total;dur=…` to `/api/*` responses so browser timings split
 * request authorization from procedure work. Durations only; nothing about the caller.
 */
export const registerServerTiming = (fastify: FastifyInstance) => {
    fastify.addHook('onRequest', async request => {
        startedAt.set(request.raw, performance.now());
    });
    fastify.addHook('onSend', async (request, reply, payload) => {
        const started = startedAt.get(request.raw);
        if (started === undefined || !request.url.startsWith('/api/')) return payload;
        const auth = authMs.get(request.raw);
        reply.header(
            'Server-Timing',
            [
                auth === undefined ? null : `auth;dur=${auth.toFixed(1)}`,
                `total;dur=${(performance.now() - started).toFixed(1)}`,
            ]
                .filter(Boolean)
                .join(', ')
        );
        return payload;
    });
};

/** Runs a request's authorization and records how long it took for `Server-Timing`. */
export const timeAuthorization = async <T>(request: FastifyRequest, authorize: () => Promise<T>) => {
    const started = performance.now();
    try {
        return await authorize();
    } finally {
        authMs.set(request.raw, performance.now() - started);
    }
};
