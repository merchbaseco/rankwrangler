import { describe, expect, it } from 'bun:test';
import Fastify from 'fastify';
import type { HealthProbe } from '@/health/health-probe';
import { registerHealthRoutes } from '@/health/health-routes';

const now = () => new Date('2026-10-08T20:00:00.000Z');
const unreachable: HealthProbe = { database: 'unreachable' };
const fresh: HealthProbe = {
    database: 'reachable',
    freshness: {
        'product-details': new Date('2026-10-09T03:00:00.000Z'),
        'product-history': 'nothing-due',
        'top-search-terms': new Date('2026-10-09T06:59:59.999Z'),
        'catalog-keywords': 'nothing-due',
    },
};

describe('health routes', () => {
    it('answers 503 naming only the database when Postgres is unreachable', async () => {
        const app = createApp(async () => unreachable);

        const health = await app.inject({ method: 'GET', url: '/api/health' });
        expect(health.statusCode).toBe(503);
        expect(health.headers['cache-control']).toBe('no-store');
        expect(health.json()).toEqual({ status: 'degraded', failing: ['database'] });
        expect((await app.inject({ method: 'HEAD', url: '/api/health' })).statusCode).toBe(503);
        await app.close();
    });

    it('answers 200 with the probe timestamp when every check is fresh', async () => {
        const app = createApp(async () => fresh);

        const health = await app.inject({ method: 'GET', url: '/api/health' });
        expect(health.statusCode).toBe(200);
        expect(health.headers['cache-control']).toBe('no-store');
        expect(health.json()).toEqual({
            status: 'ok',
            timestamp: '2026-10-08T20:00:00.000Z',
            service: 'rankwrangler-server',
        });
        await app.close();
    });

    it('keeps liveness at 200 without probing while Postgres is unreachable', async () => {
        let probes = 0;
        const app = createApp(() => {
            probes += 1;
            return Promise.resolve(unreachable);
        });

        const live = await app.inject({ method: 'GET', url: '/api/health/live' });
        expect(live.statusCode).toBe(200);
        expect(live.json()).toEqual({ status: 'ok' });
        expect((await app.inject({ method: 'HEAD', url: '/api/health/live' })).statusCode).toBe(
            200
        );
        expect(probes).toBe(0);
        expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(503);
        expect(probes).toBe(1);
        await app.close();
    });

    it('shares one probe between overlapping requests', async () => {
        let probes = 0;
        const app = createApp(async () => {
            probes += 1;
            await new Promise(resolve => setTimeout(resolve, 20));
            return unreachable;
        });

        const [first, second] = await Promise.all([
            app.inject({ method: 'GET', url: '/api/health' }),
            app.inject({ method: 'GET', url: '/api/health' }),
        ]);
        expect([first.statusCode, second.statusCode]).toEqual([503, 503]);
        expect(first.json()).toEqual({ status: 'degraded', failing: ['database'] });
        expect(second.json()).toEqual({ status: 'degraded', failing: ['database'] });
        expect(probes).toBe(1);
        await app.close();
    });

    it('answers 503 for a probe that throws and probes again on the next request', async () => {
        let probes = 0;
        const app = createApp(() => {
            probes += 1;
            return probes === 1
                ? Promise.reject(new Error('connection reset'))
                : Promise.resolve(fresh);
        });

        const failed = await app.inject({ method: 'GET', url: '/api/health' });
        expect(failed.statusCode).toBe(503);
        expect(failed.json()).toEqual({ status: 'degraded', failing: ['database'] });
        const recovered = await app.inject({ method: 'GET', url: '/api/health' });
        expect(recovered.statusCode).toBe(200);
        expect(probes).toBe(2);
        await app.close();
    });
});

const createApp = (readProbe: () => Promise<HealthProbe>) => {
    const app = Fastify({ logger: false });
    registerHealthRoutes(app, { jobRunner: 'enabled' }, { readProbe, now });
    return app;
};
