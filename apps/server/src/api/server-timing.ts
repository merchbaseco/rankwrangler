import type { FastifyInstance, FastifyRequest } from 'fastify';
import { collectRequestTiming } from '@/utils/request-timing';

const startedAt = new WeakMap<object, number>();
const authMs = new WeakMap<object, number>();
const spans = new WeakMap<object, { name: string; ms: number }[]>();

/**
 * Adds `Server-Timing: auth;dur=…, <phase>;dur=…, total;dur=…` to `/api/*` responses so browser
 * timings split request authorization and measured phases from the rest. Durations only.
 */
export const registerServerTiming = (fastify: FastifyInstance) => {
    fastify.addHook('onRequest', (request, _reply, done) => {
        startedAt.set(request.raw, performance.now());
        if (!request.url.startsWith('/api/')) return done();
        const collected: { name: string; ms: number }[] = [];
        spans.set(request.raw, collected);
        collectRequestTiming(collected, done);
    });
    fastify.addHook('onSend', async (request, reply, payload) => {
        const started = startedAt.get(request.raw);
        if (started === undefined || !request.url.startsWith('/api/')) return payload;
        const auth = authMs.get(request.raw);
        reply.header(
            'Server-Timing',
            [
                auth === undefined ? null : `auth;dur=${auth.toFixed(1)}`,
                ...(spans.get(request.raw) ?? []).map(span => `${span.name};dur=${span.ms.toFixed(1)}`),
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
