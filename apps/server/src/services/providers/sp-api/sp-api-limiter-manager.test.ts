import { describe, expect, it, mock } from 'bun:test';
import Bottleneck from 'bottleneck';
import { SyncPausedError } from '@/services/discovery-types';
import { CatalogLimiter } from './sp-api-catalog-limiter';
import { SpApiLimiterManager } from './sp-api-limiter-manager';

describe('SpApiLimiterManager', () => {
    it('stops background Catalog requests while sync is paused but lets live reads through', async () => {
        const { manager, attempts } = createManager({ paused: true });
        const run = mock(() => Promise.resolve('page'));
        await expect(catalogCall(manager, 'background', run)).rejects.toBeInstanceOf(
            SyncPausedError
        );
        expect(run).not.toHaveBeenCalled();
        expect(attempts).toHaveLength(0);
        await expect(catalogCall(manager, 'foreground', run)).resolves.toBe('page');
        expect(attempts).toEqual(['spapi.catalog.search']);
    });

    it('records a 429 attempt and slows the Catalog limiter by its Retry-After', async () => {
        const { manager, limiter, attempts } = createManager({ paused: false });
        const throttle = { status: 429, response: { headers: { 'retry-after': '120' } } };
        const run = mock(() => Promise.reject(throttle));
        await expect(catalogCall(manager, 'background', run, 1)).rejects.toThrow('after 1 attempt');
        expect(run).toHaveBeenCalledTimes(1);
        expect(attempts).toEqual(['spapi.catalog.search']);
        const snapshot = limiter.snapshot();
        expect(snapshot.effectiveRps).toBe(10);
        expect(snapshot.cooldownUntil!.getTime() - Date.now()).toBeGreaterThan(110_000);
    });

    it('keeps Reports operations on their own limiters', async () => {
        const reports = new Bottleneck({ maxConcurrent: 1 });
        const { manager } = createManager({ paused: true, reports });
        await expect(
            manager.runOperation({
                ensureAccessTokenFreshness: () => Promise.resolve(),
                operation: 'create report',
                operationId: 'reports.createReport',
                run: () => Promise.resolve('report'),
            })
        ).resolves.toBe('report');
        expect(manager.getOperationRateLimiterStats().map(stat => stat.operationId)).toEqual([
            'catalog.searchCatalogItems',
            'reports.createReport',
        ]);
    });
});

const createManager = (input: { paused: boolean; reports?: Bottleneck }) => {
    const limiter = new CatalogLimiter({ maxRps: 20 });
    const attempts: string[] = [];
    const manager = new SpApiLimiterManager(
        { limiter, documentedRps: 2, isBackgroundPaused: async () => input.paused },
        input.reports
            ? [
                  {
                      burstCapacity: 15,
                      configuredRps: 1 / 60,
                      label: 'Reports: createReport',
                      limiter: input.reports,
                      maxConcurrent: 1,
                      operationId: 'reports.createReport',
                  },
              ]
            : [],
        async (descriptor, task) => {
            attempts.push(descriptor.operation);
            return await task();
        }
    );
    return { manager, limiter, attempts };
};

const catalogCall = (
    manager: SpApiLimiterManager,
    priority: 'foreground' | 'background',
    run: () => Promise<unknown>,
    maxAttempts?: number
) =>
    manager.runOperation({
        ensureAccessTokenFreshness: () => Promise.resolve(),
        operation: `${priority} catalog search`,
        operationId: 'catalog.searchCatalogItems',
        priority,
        maxAttempts,
        run,
    });
