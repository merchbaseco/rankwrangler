import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import type { ServiceHealthResult } from '@/services/service-health';
import { type HealthRouteReaders, registerHealthRoutes } from './health-routes';

const originalConsoleError = console.error;

describe('health routes', () => {
    beforeEach(() => {
        console.error = () => undefined;
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    it('returns ok with only the status key', async () => {
        const app = appWith({
            readLiveness: () => Promise.resolve({ status: 'ok' }),
            readServiceHealth: () => Promise.resolve({ status: 'ok' }),
        });
        const response = await app.inject({ method: 'GET', url: '/api/health' });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body).toEqual({ status: 'ok' });
        expect(Object.keys(body)).toEqual(['status']);
        await app.close();
    });

    it('returns 503 with the failing checks and no error key', async () => {
        const app = appWith({
            readLiveness: () => Promise.resolve({ status: 'ok' }),
            readServiceHealth: () =>
                Promise.resolve<ServiceHealthResult>({
                    status: 'degraded',
                    failing: ['spapi-catalog', 'catalog-queries'],
                }),
        });
        const response = await app.inject({ method: 'GET', url: '/api/health' });
        const body = response.json();

        expect(response.statusCode).toBe(503);
        expect(body).toEqual({
            status: 'degraded',
            failing: ['spapi-catalog', 'catalog-queries'],
        });
        expect(Object.keys(body)).toEqual(['status', 'failing']);
        expect(body).not.toHaveProperty('error');
        await app.close();
    });

    it('does not run the freshness reader for liveness', async () => {
        const app = appWith({
            readLiveness: () => Promise.resolve({ status: 'ok' as const }),
            readServiceHealth: () => {
                throw new Error('freshness reader must not run');
            },
        });
        const response = await app.inject({ method: 'GET', url: '/health/live' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
        expect(Object.keys(response.json())).toEqual(['status']);
        await app.close();
    });

    it('turns a thrown reader into a postgres failure', async () => {
        const app = appWith({
            readLiveness: () => Promise.resolve({ status: 'ok' as const }),
            readServiceHealth: () => {
                throw new Error('reader exploded');
            },
        });
        const response = await app.inject({ method: 'GET', url: '/api/health' });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ status: 'degraded', failing: ['postgres'] });
        await app.close();
    });
});

const appWith = (readers: HealthRouteReaders) => {
    const app = Fastify({ logger: false });
    registerHealthRoutes(app, readers);
    return app;
};
