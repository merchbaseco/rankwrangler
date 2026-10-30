import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import type { ServiceHealthResult } from '@/services/service-health';
import { type HealthRouteReaders, registerHealthRoutes } from './health-routes';

type Reader = HealthRouteReaders[keyof HealthRouteReaders];

const ROUTES = [
    {
        url: '/api/health',
        reader: 'readServiceHealth',
        failing: ['keepa', 'spapi'],
        degradedBody:
            '{"status":"degraded","failing":["keepa","spapi"],"revision":"dev"}',
    },
    {
        url: '/health/live',
        reader: 'readLiveness',
        failing: ['postgres'],
        degradedBody: '{"status":"degraded","failing":["postgres"],"revision":"dev"}',
    },
] as const;

const originalConsoleError = console.error;

describe('health routes', () => {
    beforeEach(() => {
        console.error = () => undefined;
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    for (const { url, reader, failing, degradedBody } of ROUTES) {
        it(`${url} returns 200 with the revision when healthy`, async () => {
            const response = await get(url, reader, () => Promise.resolve({ status: 'ok' }));

            expect(response.statusCode).toBe(200);
            expect(response.body).toBe('{"status":"ok","revision":"dev"}');
        });

        it(`${url} returns 503 with failing checks and the revision`, async () => {
            const response = await get(url, reader, () =>
                Promise.resolve<ServiceHealthResult>({ status: 'degraded', failing })
            );

            expect(response.statusCode).toBe(503);
            expect(response.body).toBe(degradedBody);
        });

        it(`${url} turns a thrown reader into a postgres failure with the revision`, async () => {
            const response = await get(url, reader, () => {
                throw new Error('reader exploded');
            });

            expect(response.statusCode).toBe(503);
            expect(response.body).toBe(
                '{"status":"degraded","failing":["postgres"],"revision":"dev"}'
            );
        });
    }
});

const get = async (url: string, reader: keyof HealthRouteReaders, read: Reader) => {
    const app = Fastify({ logger: false });
    registerHealthRoutes(app, {
        readLiveness: otherRoute,
        readServiceHealth: otherRoute,
        [reader]: read,
    });
    const response = await app.inject({ method: 'GET', url });
    await app.close();
    return response;
};

const otherRoute: Reader = () => Promise.reject(new Error('read by the other route'));
