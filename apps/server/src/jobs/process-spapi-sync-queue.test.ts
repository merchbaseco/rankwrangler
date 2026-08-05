import { describe, expect, it, mock } from 'bun:test';

type ProcessSpApiSyncQueueDeps = NonNullable<
    Parameters<typeof import('./process-spapi-sync-queue.js')['processSpApiSyncQueue']>[0]
>;

type EventLogInput = {
    asin: string;
    action: string;
    detailsJson: Record<string, unknown>;
    status: string;
};

describe('processSpApiSyncQueue', () => {
    it('persists fetched and unavailable identities, then completes every identity', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [
            createQueueItem({ id: 'q1', asin: 'B000000001' }),
            createQueueItem({ id: 'q2', asin: 'B000000002' }),
        ];
        const fetchedProducts = [createFetchedProduct({ asin: 'B000000001' })];
        let queueReadCount = 0;
        const { deps, calls } = createDeps({
            getSpApiSyncQueueItems: async () => {
                queueReadCount += 1;
                return queueReadCount === 1 ? queueItems : [];
            },
            searchCatalogItemsByAsins: async () => fetchedProducts,
        });

        const result = await processSpApiSyncQueue(deps);

        expect(result).toMatchObject({
            didWork: true,
            queueCount: 2,
            upsertedCount: 1,
            unavailableCount: 1,
            hasMore: false,
        });
        expect(calls.persistProductSyncResults.mock.calls).toHaveLength(1);
        expect(calls.persistProductSyncResults.mock.calls[0]?.[0]).toMatchObject({
            identities: [
                { asin: 'B000000001', marketplaceId: 'ATVPDKIKX0DER' },
                { asin: 'B000000002', marketplaceId: 'ATVPDKIKX0DER' },
            ],
            products: fetchedProducts,
        });
        expect(calls.deleteSpApiSyncQueueItems.mock.calls).toEqual([[['q1', 'q2']]]);
        expect(calls.notifyProductSyncCompleted.mock.calls).toEqual([
            [{ marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' }],
            [{ marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' }],
        ]);

        const [eventLogs] = calls.createEventLogsSafe.mock.calls[0] ?? [];
        const typedEventLogs = eventLogs as EventLogInput[];
        expect(typedEventLogs).toHaveLength(2);
        expect(typedEventLogs.find(log => log.asin === 'B000000001')).toMatchObject({
            action: 'product.sync',
            status: 'success',
        });
        expect(typedEventLogs.find(log => log.asin === 'B000000002')).toMatchObject({
            action: 'product.sync',
            status: 'success',
            detailsJson: { reason: 'empty_provider_response' },
        });
    });

    it('leaves queue items for retry and logs the shared persistence failure', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [createQueueItem({ id: 'q1', asin: 'B000000003' })];
        const { deps, calls } = createDeps({
            getSpApiSyncQueueItems: async () => queueItems,
            persistProductSyncResults: async () => {
                throw new Error('persist exploded');
            },
            searchCatalogItemsByAsins: async () => [createFetchedProduct({ asin: 'B000000003' })],
        });

        await expect(processSpApiSyncQueue(deps)).rejects.toThrow('persist exploded');

        expect(calls.deleteSpApiSyncQueueItems.mock.calls).toHaveLength(0);
        const [eventLogs] = calls.createEventLogsSafe.mock.calls[0] ?? [];
        expect(eventLogs).toMatchObject([
            {
                asin: 'B000000003',
                action: 'product.sync',
                status: 'failed',
                detailsJson: { stage: 'persist' },
            },
        ]);
    });

    it('logs queue deletion failures after persistence succeeds', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [createQueueItem({ id: 'q1', asin: 'B000000004' })];
        const { deps, calls } = createDeps({
            getSpApiSyncQueueItems: async () => queueItems,
            deleteSpApiSyncQueueItems: async () => {
                throw new Error('delete exploded');
            },
            searchCatalogItemsByAsins: async () => [createFetchedProduct({ asin: 'B000000004' })],
        });

        await expect(processSpApiSyncQueue(deps)).rejects.toThrow('delete exploded');

        expect(calls.persistProductSyncResults.mock.calls).toHaveLength(1);
        expect(calls.notifyProductSyncCompleted.mock.calls).toHaveLength(0);
        const [eventLogs] = calls.createEventLogsSafe.mock.calls[0] ?? [];
        expect(eventLogs).toMatchObject([
            {
                asin: 'B000000004',
                action: 'product.sync',
                status: 'failed',
                detailsJson: { stage: 'delete_queue' },
            },
        ]);
    });
});

const createDeps = (overrides: Partial<ProcessSpApiSyncQueueDeps> = {}) => {
    const calls = {
        createEventLogsSafe: mock(async () => {}),
        deleteSpApiSyncQueueItems: mock(async () => {}),
        getSpApiSyncQueueItems: mock(async () => []),
        notifyProductSyncCompleted: mock(() => {}),
        persistProductSyncResults: mock(async () => {}),
        searchCatalogItemsByAsins: mock(async () => []),
    };

    return {
        deps: { ...calls, ...overrides } as ProcessSpApiSyncQueueDeps,
        calls,
    };
};

const createQueueItem = ({ id, asin }: { id: string; asin: string }) => ({
    id,
    marketplaceId: 'ATVPDKIKX0DER',
    asin,
    createdAt: new Date('2026-08-03T12:00:00.000Z'),
});

const createFetchedProduct = ({ asin }: { asin: string }) =>
    ({ asin, marketplaceId: 'ATVPDKIKX0DER' }) as Awaited<
        ReturnType<ProcessSpApiSyncQueueDeps['searchCatalogItemsByAsins']>
    >[number];

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./process-spapi-sync-queue.js');
};

const seedRequiredEnvForTests = () => {
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
    process.env.CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY ?? 'pk_test_rankwrangler';
    process.env.CLERK_JWT_KEY = process.env.CLERK_JWT_KEY ?? 'test-jwt-key';
    process.env.CLERK_ISSUER = process.env.CLERK_ISSUER ?? 'https://clerk.test';
    process.env.CLERK_AUTHORIZED_PARTIES =
        process.env.CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
