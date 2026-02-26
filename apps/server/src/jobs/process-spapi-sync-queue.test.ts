import { describe, expect, it, mock } from 'bun:test';

type ProcessSpApiSyncQueueDeps = NonNullable<
    Parameters<(typeof import('./process-spapi-sync-queue.js'))['processSpApiSyncQueue']>[0]
>;

type EventLogInput = {
    asin: string;
    action: string;
    detailsJson: Record<string, unknown>;
    status: string;
};

describe('processSpApiSyncQueue', () => {
    it('logs only unsynced ASINs as failed when upsert throws', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [
            createQueueItem({ id: 'q1', asin: 'B000000001' }),
            createQueueItem({ id: 'q2', asin: 'B000000002' }),
            createQueueItem({ id: 'q3', asin: 'B000000003' }),
        ];
        const fetchedProducts = queueItems.map(item =>
            createFetchedProduct({ asin: item.asin, marketplaceId: item.marketplaceId })
        );
        const { deps, calls } = createDeps({
            deleteSpApiSyncQueueItems: async () => {},
            getSpApiSyncQueueItems: async () => queueItems,
            searchCatalogItemsByAsins: async () => fetchedProducts,
            upsertProductInfo: async (product) => {
                if (product.asin === 'B000000002') {
                    throw new Error('upsert exploded');
                }
            },
        });

        await expect(processSpApiSyncQueue(deps)).rejects.toThrow('upsert exploded');

        expect(calls.createEventLogsSafe.mock.calls).toHaveLength(1);
        const [failedLogs] = calls.createEventLogsSafe.mock.calls[0];
        const typedFailedLogs = failedLogs as EventLogInput[];
        expect(typedFailedLogs.map(log => log.asin)).toEqual(['B000000002', 'B000000003']);
        expect(typedFailedLogs.every(log => log.status === 'failed')).toBeTrue();
        expect(typedFailedLogs.every(log => log.action === 'product.sync')).toBeTrue();
        expect(typedFailedLogs.every(log => log.detailsJson.stage === 'upsert')).toBeTrue();
    });

    it('does not emit per-ASIN failed logs when delete stage throws', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [
            createQueueItem({ id: 'q1', asin: 'B000000011' }),
            createQueueItem({ id: 'q2', asin: 'B000000012' }),
        ];
        const fetchedProducts = queueItems.map(item =>
            createFetchedProduct({ asin: item.asin, marketplaceId: item.marketplaceId })
        );
        const { deps, calls } = createDeps({
            deleteSpApiSyncQueueItems: async () => {
                throw new Error('delete exploded');
            },
            getSpApiSyncQueueItems: async () => queueItems,
            searchCatalogItemsByAsins: async () => fetchedProducts,
            upsertProductInfo: async () => {},
        });

        await expect(processSpApiSyncQueue(deps)).rejects.toThrow('delete exploded');

        expect(calls.createEventLogsSafe.mock.calls).toHaveLength(0);
    });

    it('keeps no-payload failures in the success path', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [
            createQueueItem({ id: 'q1', asin: 'B000000021' }),
            createQueueItem({ id: 'q2', asin: 'B000000022' }),
        ];
        const fetchedProducts = [
            createFetchedProduct({
                asin: queueItems[0].asin,
                marketplaceId: queueItems[0].marketplaceId,
            }),
        ];
        let queueReadCount = 0;
        const { deps, calls } = createDeps({
            deleteSpApiSyncQueueItems: async () => {},
            getSpApiSyncQueueItems: async () => {
                queueReadCount += 1;
                return queueReadCount === 1 ? queueItems : [];
            },
            searchCatalogItemsByAsins: async () => fetchedProducts,
            upsertProductInfo: async () => {},
        });

        const result = await processSpApiSyncQueue(deps);

        expect(result.didWork).toBeTrue();
        expect(result.upsertedCount).toBe(1);
        expect(calls.createEventLogsSafe.mock.calls).toHaveLength(1);
        const [eventLogs] = calls.createEventLogsSafe.mock.calls[0];
        const typedEventLogs = eventLogs as EventLogInput[];
        expect(typedEventLogs).toHaveLength(2);
        expect(typedEventLogs.find(log => log.asin === 'B000000021')?.status).toBe('success');
        expect(typedEventLogs.find(log => log.asin === 'B000000022')?.status).toBe('failed');
        expect(typedEventLogs.every(log => log.action === 'product.sync')).toBeTrue();
    });
});

const createDeps = (overrides: Partial<ProcessSpApiSyncQueueDeps> = {}) => {
    const calls = {
        createEventLogsSafe: mock(async () => {}),
        deleteSpApiSyncQueueItems: mock(async () => {}),
        getSpApiSyncQueueItems: mock(async () => []),
        searchCatalogItemsByAsins: mock(async () => []),
        upsertProductInfo: mock(async () => {}),
    };

    return {
        deps: {
            ...calls,
            ...overrides,
        } as ProcessSpApiSyncQueueDeps,
        calls,
    };
};

const createQueueItem = ({ id, asin }: { id: string; asin: string }) => ({
    id,
    marketplaceId: 'ATVPDKIKX0DER',
    asin,
});

const createFetchedProduct = ({ asin, marketplaceId }: { asin: string; marketplaceId: string }) => {
    return {
        asin,
        marketplaceId,
    } as Awaited<ReturnType<ProcessSpApiSyncQueueDeps['searchCatalogItemsByAsins']>>[number];
};

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./process-spapi-sync-queue.js');
};

const seedRequiredEnvForTests = () => {
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.LICENSE_SECRET =
        process.env.LICENSE_SECRET ?? '12345678901234567890123456789012';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
};
