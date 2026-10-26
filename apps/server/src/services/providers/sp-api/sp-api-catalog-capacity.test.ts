import { describe, expect, it, mock } from 'bun:test';
import { CatalogCapacityDeferredError } from '@/services/discovery-types';
import { runWithSpApiBackoff } from './sp-api-backoff';
import { type CatalogCapacity, runWithCatalogCapacity } from './sp-api-catalog-capacity';

describe('Catalog physical dispatch boundary', () => {
    it('never sends or retries a budget-deferred discovery request', async () => {
        const retryAt = new Date(Date.now() + 60_000);
        const run = mock(() => Promise.resolve({}));
        const observe = mock(() => Promise.resolve());
        const capacity: CatalogCapacity = {
            reserve: () => Promise.resolve({ kind: 'deferred', reason: 'rate', retryAt }),
            observe,
        };
        const work = () =>
            runWithCatalogCapacity({
                capacity,
                priority: 'background',
                attemptId: 'receipt',
                protectedQueued: false,
                run,
            });
        const error = await runWithSpApiBackoff({ operation: 'discovery', run: work }).catch(
            error => error
        );
        expect(error).toBeInstanceOf(CatalogCapacityDeferredError);
        if (!(error instanceof CatalogCapacityDeferredError)) throw error;
        expect(error.retryAt).toEqual(retryAt);
        expect(run).not.toHaveBeenCalled();
        expect(observe).not.toHaveBeenCalled();
    });
    it('records a physical throttle and its Retry-After before returning the provider failure', async () => {
        const observe = mock((_input: Parameters<CatalogCapacity['observe']>[0]) =>
            Promise.resolve()
        );
        const failure = { status: 429, response: { headers: { 'retry-after': '120' } } };
        const capacity: CatalogCapacity = {
            reserve: () => Promise.resolve({ kind: 'granted' }),
            observe,
        };
        await expect(
            runWithCatalogCapacity({
                capacity,
                priority: 'background',
                attemptId: 'receipt',
                protectedQueued: false,
                run: () => Promise.reject(failure),
            })
        ).rejects.toBe(failure);
        expect(observe.mock.calls[0]?.[0]).toMatchObject({
            attemptId: 'receipt',
            throttled: true,
            failed: true,
            retryAfterMs: 120_000,
        });
    });
});
