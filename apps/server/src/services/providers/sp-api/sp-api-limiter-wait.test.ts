import { describe, expect, it, mock } from 'bun:test';
import Bottleneck from 'bottleneck';
import { SpApiLimiterManager } from './sp-api-limiter-manager';
import { SpApiLimiterWaitError, scheduleWithQueueDeadline } from './sp-api-limiter-wait';

describe('scheduleWithQueueDeadline', () => {
    it('rejects a call the limiter never starts and skips it once released', async () => {
        const limiter = new Bottleneck({ maxConcurrent: 1, reservoir: 0 });
        const task = mock(() => Promise.resolve('ran'));

        await expect(
            scheduleWithQueueDeadline({
                limiter,
                maxQueueWaitMs: 20,
                onQueueDeadline: () => createWaitError(20),
                task,
            })
        ).rejects.toBeInstanceOf(SpApiLimiterWaitError);

        await limiter.incrementReservoir(1);
        await waitForLimiterIdle(limiter);
        expect(task).not.toHaveBeenCalled();
    });

    it('resolves a call that starts before the deadline', async () => {
        const limiter = new Bottleneck({ maxConcurrent: 1 });

        await expect(
            scheduleWithQueueDeadline({
                limiter,
                maxQueueWaitMs: 1000,
                onQueueDeadline: () => createWaitError(1000),
                task: () => Promise.resolve('ran'),
            })
        ).resolves.toBe('ran');
    });
});

describe('SpApiLimiterManager queue deadline', () => {
    it('fails a wedged Catalog limiter with the named error instead of retrying', async () => {
        const limiter = new Bottleneck({ maxConcurrent: 2, reservoir: 0 });
        const manager = new SpApiLimiterManager([
            {
                burstCapacity: 2,
                configuredRps: 2,
                label: 'Catalog Search',
                limiter,
                maxConcurrent: 2,
                maxQueueWaitMs: 20,
                operationId: 'catalog.searchCatalogItems',
            },
        ]);
        const consoleError = mock(() => undefined);
        const originalConsoleError = console.error;
        console.error = consoleError;
        const run = mock(() => Promise.resolve('ok'));

        try {
            const error = await manager
                .runOperation({
                    ensureAccessTokenFreshness: () => Promise.resolve(),
                    operation: 'search catalog items',
                    operationId: 'catalog.searchCatalogItems',
                    run,
                })
                .catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(SpApiLimiterWaitError);
            expect((error as Error).message).toContain('Catalog Search limiter');
            expect(run).not.toHaveBeenCalled();
            expect(consoleError).toHaveBeenCalledTimes(1);
        } finally {
            console.error = originalConsoleError;
            await limiter.stop({ dropWaitingJobs: true });
        }
    });
});

const createWaitError = (maxQueueWaitMs: number) =>
    new SpApiLimiterWaitError({
        operationId: 'catalog.searchCatalogItems',
        label: 'Catalog Search',
        maxQueueWaitMs,
    });

const waitForLimiterIdle = async (limiter: Bottleneck) => {
    for (let attempt = 0; attempt < 50 && !limiter.empty(); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    await new Promise(resolve => setTimeout(resolve, 10));
};
