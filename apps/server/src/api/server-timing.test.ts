import { describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import { measure } from '@/utils/request-timing';
import { registerServerTiming, timeAuthorization } from './server-timing';

describe('Server-Timing', () => {
    it('reports authorization, measured phases and the total for API responses', async () => {
        const fastify = Fastify();
        registerServerTiming(fastify);
        fastify.get('/api/read', async request => {
            await timeAuthorization(request, async () => null);
            await measure('page', () => new Promise(resolve => setTimeout(resolve, 2)));
            return { ok: true };
        });
        fastify.get('/health/live', async () => ({ ok: true }));
        const api = await fastify.inject({ url: '/api/read' });
        expect(String(api.headers['server-timing'])).toMatch(
            /^auth;dur=[\d.]+, page;dur=[\d.]+, busy;dur=\d+, lag;dur=[\d.]+, total;dur=[\d.]+$/
        );
        expect((await fastify.inject({ url: '/health/live' })).headers['server-timing']).toBe(
            undefined
        );
        await fastify.close();
    });
});
