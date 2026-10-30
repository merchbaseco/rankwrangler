import { monitorEventLoopDelay, performance as nodePerformance } from 'node:perf_hooks';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { collectRequestTiming } from '@/utils/request-timing';

const startedAt = new WeakMap<object, number>();
const loopAt = new WeakMap<object, ReturnType<typeof nodePerformance.eventLoopUtilization>>();
// Event-loop delay over the last ten seconds, so a response shows whether the process was stalled.
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
setInterval(() => loopDelay.reset(), 10_000).unref();
const authMs = new WeakMap<object, number>();
const spans = new WeakMap<object, { name: string; ms: number }[]>();

/**
 * Adds `Server-Timing: auth;dur=…, <phase>;dur=…, total;dur=…` to `/api/*` responses so browser
 * timings split request authorization and measured phases from the rest, plus `busy` (percent of
 * the request the event loop spent running other work) and `lag` (worst event-loop delay in the
 * last ten seconds). Durations only.
 */
export const registerServerTiming = (fastify: FastifyInstance) => {
    fastify.addHook('onRequest', (request, _reply, done) => {
        startedAt.set(request.raw, performance.now());
        loopAt.set(request.raw, nodePerformance.eventLoopUtilization());
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
                `busy;dur=${loopBusyPercent(loopAt.get(request.raw))}`,
                `lag;dur=${(loopDelay.max / 1e6).toFixed(1)}`,
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

const loopBusyPercent = (since?: ReturnType<typeof nodePerformance.eventLoopUtilization>) =>
    since ? (nodePerformance.eventLoopUtilization(since).utilization * 100).toFixed(0) : '0';
