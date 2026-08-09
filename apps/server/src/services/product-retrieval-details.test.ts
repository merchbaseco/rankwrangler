import { describe, expect, it, mock } from 'bun:test';
import { getProductDetails, getRequiredProduct } from './product-retrieval';
import { RetrievalRetryableError } from './retrieval-coordinator';
import { SpApiBackoffError } from './spapi/spapi-backoff';

describe('Product detail retrieval', () => {
    it('returns stale available Product details immediately and schedules background work', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000008' };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(1));
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        const deps = {
            getStoredProducts: mock(() =>
                Promise.resolve([
                    {
                        product: createStoredProduct(identity, {
                            spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                            thumbnailUrl: 'https://example.com/stale.jpg',
                        }),
                        queuePending: false,
                    },
                ])
            ),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const result = await getProductDetails(identity, deps);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
        expect(enqueueSpApiSyncQueueItems).toHaveBeenCalledWith([identity]);
        expect(result).toMatchObject({
            availability: 'available',
            product: {
                freshness: {
                    stale: true,
                    updatedAt: '2026-07-01T12:00:00.000Z',
                },
            },
        });
    });

    it('coalesces explicit Product refreshes through the shared coordinator', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000009' };
        let readCount = 0;
        let releaseProvider: (() => void) | undefined;
        const providerStarted = new Promise<void>(resolve => {
            releaseProvider = resolve;
        });
        const providerProduct = {
            ...identity,
            dateFirstAvailable: null,
            title: 'Refreshed title',
            brand: 'Refreshed brand',
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
            rootCategoryId: null,
            rootCategoryBsr: null,
            thumbnailUrl: 'https://example.com/refreshed.jpg',
            keepa: null,
            fetchedAt: new Date().toISOString(),
        };
        const searchCatalogItemsByAsins = mock(async () => {
            await providerStarted;
            return [providerProduct];
        });
        const deps = {
            getStoredProducts: mock(() => {
                readCount += 1;
                return Promise.resolve([
                    {
                        product: createStoredProduct(identity, {
                            title: readCount > 1 ? 'Refreshed title' : 'Stale title',
                            thumbnailUrl:
                                readCount > 1
                                    ? 'https://example.com/refreshed.jpg'
                                    : 'https://example.com/stale.jpg',
                            spApiFetchedAt:
                                readCount > 1 ? new Date() : new Date('2026-07-01T12:00:00.000Z'),
                            spApiResolvedAt: readCount > 1 ? new Date() : null,
                        }),
                        queuePending: false,
                    },
                ]);
            }),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.resolve(0)),
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const first = getProductDetails({ ...identity, refresh: true }, deps);
        const second = getProductDetails({ ...identity, refresh: true }, deps);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(searchCatalogItemsByAsins).toHaveBeenCalledTimes(1);
        releaseProvider?.();
        const [firstResult, secondResult] = await Promise.all([first, second]);

        expect(firstResult.product?.title).toBe('Refreshed title');
        expect(secondResult.product?.title).toBe('Refreshed title');
    });

    it('forces a provider refresh when explicitly requested for an unavailable Product', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000012' };
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        let readCount = 0;
        const deps = {
            getStoredProducts: mock(() => {
                readCount += 1;
                return Promise.resolve([
                    {
                        product: createStoredProduct(identity, {
                            isUnavailable: true,
                            spApiFetchedAt: new Date(),
                            spApiResolvedAt: new Date(),
                        }),
                        queuePending: false,
                    },
                ]);
            }),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.resolve(0)),
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const result = await getProductDetails({ ...identity, refresh: true }, deps);

        expect(readCount).toBe(2);
        expect(searchCatalogItemsByAsins).toHaveBeenCalledWith(identity.marketplaceId, [
            identity.asin,
        ]);
        expect(result.availability).toBe('available');
    });

    it('waits for a missing Product and reports definitive absence as NOT_FOUND', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000010' };
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        const deps = {
            getStoredProducts: mock(() => Promise.resolve([])),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.resolve(0)),
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        await expect(getRequiredProduct(identity, deps)).rejects.toMatchObject({
            code: 'NOT_FOUND',
        });
        expect(searchCatalogItemsByAsins).toHaveBeenCalledWith(identity.marketplaceId, [
            identity.asin,
        ]);
    });

    it('finishes durable queue cleanup after an explicit caller detaches', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000013' };
        const controller = new AbortController();
        let releaseProvider: (() => void) | undefined;
        let signalProviderStarted: (() => void) | undefined;
        let signalQueueDeleted: (() => void) | undefined;
        const providerStarted = new Promise<void>(resolve => {
            signalProviderStarted = resolve;
        });
        const providerReleased = new Promise<void>(resolve => {
            releaseProvider = resolve;
        });
        const queueDeleted = new Promise<void>(resolve => {
            signalQueueDeleted = resolve;
        });
        const searchCatalogItemsByAsins = mock(async () => {
            signalProviderStarted?.();
            await providerReleased;
            return [];
        });
        const persistProductSyncResults = mock(() => Promise.resolve(undefined));
        const deleteSpApiSyncQueueItemsForIdentities = mock(() => {
            signalQueueDeleted?.();
            return Promise.resolve(undefined);
        });
        const deps = {
            getStoredProducts: mock(() =>
                Promise.resolve([
                    {
                        product: createStoredProduct(identity, {
                            spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                        }),
                        queuePending: true,
                    },
                ])
            ),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.resolve(0)),
            searchCatalogItemsByAsins,
            persistProductSyncResults,
            deleteSpApiSyncQueueItemsForIdentities,
        } as never;

        const refresh = getProductDetails(
            { ...identity, refresh: true, signal: controller.signal },
            deps
        );
        await providerStarted;
        controller.abort();

        await expect(refresh).rejects.toMatchObject({ reason: 'caller_detached' });
        releaseProvider?.();
        await queueDeleted;

        expect(persistProductSyncResults).toHaveBeenCalledTimes(1);
        expect(deleteSpApiSyncQueueItemsForIdentities).toHaveBeenCalledWith([identity]);
    });

    it('maps temporary provider capacity to the shared retryable Product error', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000011' };
        const searchCatalogItemsByAsins = mock(() =>
            Promise.reject(
                new SpApiBackoffError({
                    operation: 'catalog search',
                    attempts: 5,
                    retryable: true,
                    reason: 'capacity',
                })
            )
        );
        const deps = {
            getStoredProducts: mock(() => Promise.resolve([])),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.resolve(0)),
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        await expect(getRequiredProduct(identity, deps)).rejects.toBeInstanceOf(
            RetrievalRetryableError
        );
    });
});

const createStoredProduct = (
    {
        marketplaceId,
        asin,
    }: {
        marketplaceId: string;
        asin: string;
    },
    overrides: Record<string, unknown> = {}
) =>
    ({
        marketplaceId,
        asin,
        dateFirstAvailable: null,
        thumbnailUrl: null,
        title: 'Keepa title',
        brand: null,
        isMerchListing: false,
        bullet1: null,
        bullet2: null,
        rootCategoryId: null,
        rootCategoryBsr: null,
        spApiFetchedAt: null,
        spApiResolvedAt: null,
        keepaFetchedAt: new Date('2026-08-03T12:00:00.000Z'),
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
