import { describe, expect, it } from 'bun:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import Fastify from 'fastify';
import { registerInteractiveRequests } from './interactive-requests';

describe('interactive requests', () => {
    it('runs API handlers inside the interactive scope and other routes outside it', async () => {
        const scope = new AsyncLocalStorage<true>();
        const fastify = Fastify();
        registerInteractiveRequests(fastify, work => scope.run(true, work));
        const read = async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return { interactive: scope.getStore() === true };
        };
        fastify.get('/api/read', read);
        fastify.get('/health/live', read);
        expect((await fastify.inject({ url: '/api/read' })).json()).toEqual({ interactive: true });
        expect((await fastify.inject({ url: '/health/live' })).json()).toEqual({
            interactive: false,
        });
        await fastify.close();
    });
});
