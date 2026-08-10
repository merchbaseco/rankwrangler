import { describe, expect, it, mock } from 'bun:test';

type ProcessSpApiSyncQueueDeps = NonNullable<
    Parameters<typeof import('./process-spapi-sync-queue.js')['processSpApiSyncQueue']>[0]
>;

interface EventLogInput {
    asin: string;
    action: string;
    detailsJson: Record<string, unknown>;
    status: string;
}

describe('processSpApiSyncQueue', () => {
    it('persists active and deleted identities, then completes every identity', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [
            createQueueItem({ id: 'q1', asin: 'B000000001' }),
            createQueueItem({ id: 'q2', asin: 'B000000002' }),
        ];
        const fetchedProducts = [createFetchedProduct({ asin: 'B000000001' })];
        const searchCatalogItemsByAsins = mock(async () => fetchedProducts);
        let queueReadCount = 0;
        const { deps, calls } = createDeps({
            getSpApiSyncQueueItems: () => {
                queueReadCount += 1;
                return Promise.resolve(queueReadCount === 1 ? queueItems : []);
            },
            searchCatalogItemsByAsins,
        });

        const result = await processSpApiSyncQueue(deps);

        expect(result).toMatchObject({
            didWork: true,
            queueCount: 2,
            upsertedCount: 1,
            deletedCount: 1,
            hasMore: false,
        });
        expect(searchCatalogItemsByAsins.mock.calls).toEqual([
            ['ATVPDKIKX0DER', ['B000000001', 'B000000002']],
        ]);
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

    it('coalesces queue execution with an explicit Product refresh', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const { getProductDetails } = await import('@/services/product-retrieval');
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000005' };
        const queueItem = createQueueItem({ id: 'q5', asin: identity.asin });
        const fetchedProduct = createFetchedProduct({ asin: identity.asin });
        let releaseProvider: (() => void) | undefined;
        let signalProviderStarted: (() => void) | undefined;
        const providerStarted = new Promise<void>(resolve => {
            signalProviderStarted = resolve;
        });
        const providerReleased = new Promise<void>(resolve => {
            releaseProvider = resolve;
        });
        const searchCatalogItemsByAsins = mock(async () => {
            signalProviderStarted?.();
            await providerReleased;
            return [fetchedProduct];
        });
        const queuePersist = mock(() => Promise.resolve(undefined));
        const explicitPersist = mock(() => Promise.resolve(undefined));
        const explicitDelete = mock(() => Promise.resolve(undefined));
        let queueReadCount = 0;
        const { deps: queueDeps, calls } = createDeps({
            getSpApiSyncQueueItems: () => {
                queueReadCount += 1;
                return Promise.resolve(queueReadCount === 1 ? [queueItem] : []);
            },
            searchCatalogItemsByAsins,
            persistProductSyncResults: queuePersist,
        });
        let productReadCount = 0;
        const detailDeps = {
            getStoredProducts: mock(() => {
                productReadCount += 1;
                return Promise.resolve([
                    {
                        product: createStoredProduct(identity, {
                            title: productReadCount > 1 ? 'Fetched title' : 'Stale title',
                            spApiFetchedAt:
                                productReadCount > 1
                                    ? new Date()
                                    : new Date('2026-07-01T12:00:00.000Z'),
                        }),
                        queuePending: productReadCount === 1,
                    },
                ]);
            }),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.resolve(0)),
            searchCatalogItemsByAsins,
            persistProductSyncResults: explicitPersist,
            deleteSpApiSyncQueueItemsForIdentities: explicitDelete,
        } as never;

        const queueRun = processSpApiSyncQueue(queueDeps);
        await providerStarted;
        const refreshRun = getProductDetails({ ...identity, refresh: true }, detailDeps);
        releaseProvider?.();

        const [, refreshed] = await Promise.all([queueRun, refreshRun]);

        expect(searchCatalogItemsByAsins).toHaveBeenCalledTimes(1);
        expect(queuePersist).toHaveBeenCalledTimes(1);
        expect(explicitPersist).not.toHaveBeenCalled();
        expect(explicitDelete).toHaveBeenCalledWith([identity]);
        expect(calls.deleteSpApiSyncQueueItems).toHaveBeenCalledWith(['q5']);
        expect(refreshed).toMatchObject({
            amazonListingStatus: 'active',
            product: { title: 'Fetched title' },
        });
    });

    it('leaves queue items for retry and logs the shared persistence failure', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const queueItems = [createQueueItem({ id: 'q1', asin: 'B000000003' })];
        const { deps, calls } = createDeps({
            getSpApiSyncQueueItems: async () => queueItems,
            persistProductSyncResults: () => Promise.reject(new Error('persist exploded')),
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
            deleteSpApiSyncQueueItems: () => Promise.reject(new Error('delete exploded')),
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
        createEventLogsSafe: mock(() => Promise.resolve(undefined)),
        deleteSpApiSyncQueueItems: mock(() => Promise.resolve(undefined)),
        getSpApiSyncQueueItems: mock(async () => []),
        notifyProductSyncCompleted: mock(() => undefined),
        persistProductSyncResults: mock(() => Promise.resolve(undefined)),
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

const createStoredProduct = (
    { marketplaceId, asin }: { marketplaceId: string; asin: string },
    overrides: Record<string, unknown> = {}
) =>
    ({
        marketplaceId,
        asin,
        dateFirstAvailable: null,
        thumbnailUrl: null,
        title: 'Stored title',
        brand: null,
        isMerchListing: false,
        bullet1: null,
        bullet2: null,
        rootCategoryId: null,
        rootCategoryBsr: null,
        spApiFetchedAt: null,
        spApiResolvedAt: null,
        keepaFetchedAt: null,
        keepaSourceUpdatedAt: null,
        keepaFirstTrackedAt: null,
        keepaRootCategoryId: null,
        keepaCurrentBsr: null,
        keepaCurrentNewPrice: null,
        keepaMonthlySold: null,
        keepaBsrAverage30: null,
        keepaBsrAverage90: null,
        keepaSalesRankDrops30: null,
        keepaSalesRankDrops90: null,
        keepaSalesRankDrops180: null,
        keepaSalesRankDrops365: null,
        createdAt: new Date('2026-08-03T12:00:00.000Z'),
        ...overrides,
    }) as never;

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
