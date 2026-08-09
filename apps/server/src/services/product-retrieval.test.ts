import { describe, expect, it, mock } from 'bun:test';
import { getProducts, persistProductSyncResults } from './product-retrieval';

describe('Product sync persistence', () => {
    it('records omitted ASINs as unavailable after a successful provider response', async () => {
        const identities = [
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' },
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' },
        ];
        const products = [createSpApiProduct(identities[0])];
        const resolvedAt = new Date('2026-08-08T12:00:00.000Z');
        const deps = {
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            upsertProductInfo: mock(() => Promise.resolve(undefined)),
            markProductsUnavailable: mock(() => Promise.resolve(1)),
        };

        await persistProductSyncResults({ identities, products, resolvedAt }, deps);

        expect(deps.upsertProductInfo).toHaveBeenCalledWith(products[0]);
        expect(deps.markProductsUnavailable).toHaveBeenCalledWith([identities[1]], resolvedAt);
    });
});

describe('Product retrieval', () => {
    it('returns cached Products as pending and batch-enqueues without a provider fetch', async () => {
        const identities = [
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' },
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' },
        ];
        let readCount = 0;
        const getStoredProducts = mock(() => {
            readCount += 1;
            return Promise.resolve(
                identities.map(identity => ({
                    product: createStoredProduct(identity),
                    queuePending: readCount > 1,
                }))
            );
        });
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(identities.length));
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const result = await getProducts(
            {
                products: identities,
                fetchPolicy: 'background',
            },
            deps
        );

        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
        expect(enqueueSpApiSyncQueueItems).toHaveBeenCalledWith(identities);
        expect(result).toHaveLength(identities.length);
        expect(result[0]).toMatchObject({
            availability: 'pending',
            product: {
                thumbnail: { status: 'pending' },
            },
        });
    });

    it('does not report pending when background queueing cannot be made durable', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000007' };
        const deps = {
            getStoredProducts: mock(() =>
                Promise.resolve([
                    {
                        product: createStoredProduct(identity),
                        queuePending: false,
                    },
                ])
            ),
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems: mock(() => Promise.reject(new Error('queue offline'))),
            searchCatalogItemsByAsins: mock(() => Promise.resolve([])),
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        await expect(
            getProducts({ products: [identity], fetchPolicy: 'background' }, deps)
        ).rejects.toThrow('queue offline');
    });

    it('blocks regular Product reads through the same service until provider data is resolved', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000003' };
        let readCount = 0;
        const getStoredProducts = mock(() => {
            readCount += 1;
            return Promise.resolve([
                {
                    product:
                        readCount === 1
                            ? createStoredProduct(identity)
                            : createStoredProduct(identity, {
                                  title: 'Fetched title',
                                  brand: 'Fetched brand',
                                  thumbnailUrl: 'https://example.com/thumbnail.jpg',
                                  spApiFetchedAt: new Date(),
                                  spApiResolvedAt: new Date(),
                              }),
                    queuePending: false,
                },
            ]);
        });
        const providerProduct = {
            ...identity,
            dateFirstAvailable: null,
            title: 'Fetched title',
            brand: 'Fetched brand',
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
            rootCategoryId: null,
            rootCategoryBsr: null,
            thumbnailUrl: 'https://example.com/thumbnail.jpg',
            keepa: null,
            fetchedAt: new Date().toISOString(),
        };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(0));
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([providerProduct]));
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const result = await getProducts({ products: [identity], fetchPolicy: 'blocking' }, deps);

        expect(searchCatalogItemsByAsins).toHaveBeenCalledWith(identity.marketplaceId, [
            identity.asin,
        ]);
        expect(enqueueSpApiSyncQueueItems).not.toHaveBeenCalled();
        expect(result[0]).toMatchObject({
            availability: 'available',
            product: {
                title: 'Fetched title',
                thumbnail: { status: 'available', url: 'https://example.com/thumbnail.jpg' },
            },
        });
    });

    it('returns stale Product data immediately while background refresh is queued', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000004' };
        let readCount = 0;
        const getStoredProducts = mock(() => {
            readCount += 1;
            return Promise.resolve([
                {
                    product: createStoredProduct(identity, {
                        spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                        thumbnailUrl: 'https://example.com/stale.jpg',
                    }),
                    queuePending: readCount > 1,
                },
            ]);
        });
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(1));
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const [result] = await getProducts(
            { products: [identity], fetchPolicy: 'background' },
            deps
        );

        expect(enqueueSpApiSyncQueueItems).toHaveBeenCalledWith([identity]);
        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            availability: 'available',
            product: { thumbnail: { status: 'available', url: 'https://example.com/stale.jpg' } },
        });
    });

    it('does not requeue a completed empty provider response', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000005' };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(0));
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        const deps = {
            getStoredProducts: mock(() =>
                Promise.resolve([
                    {
                        product: createStoredProduct(identity, {
                            isUnavailable: true,
                            spApiResolvedAt: new Date(Date.now() - 60_000),
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

        const [result] = await getProducts(
            { products: [identity], fetchPolicy: 'background' },
            deps
        );

        expect(enqueueSpApiSyncQueueItems).not.toHaveBeenCalled();
        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            availability: 'unavailable',
            product: { thumbnail: { status: 'unavailable' } },
        });
    });

    it('keeps last-known listing data visible when Amazon marks the Product unavailable', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000006' };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(0));
        const getStoredProducts = mock(() =>
            Promise.resolve([
                {
                    product: createStoredProduct(identity, {
                        isUnavailable: true,
                        thumbnailUrl: 'https://example.com/old.jpg',
                        spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                        spApiResolvedAt: new Date(Date.now() - 60_000),
                    }),
                    queuePending: false,
                },
            ])
        );
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(() => Promise.resolve(0)),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins: mock(() => Promise.resolve([])),
            persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        } as never;

        const [result] = await getProducts(
            { products: [identity], fetchPolicy: 'background' },
            deps
        );

        expect(enqueueSpApiSyncQueueItems).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            availability: 'available',
            product: {
                isUnavailable: true,
                thumbnail: { status: 'available', url: 'https://example.com/old.jpg' },
            },
        });
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
        isUnavailable: false,
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

const createSpApiProduct = ({ marketplaceId, asin }: { marketplaceId: string; asin: string }) => ({
    marketplaceId,
    asin,
    dateFirstAvailable: null,
    title: 'Fetched title',
    brand: null,
    isMerchListing: false,
    bullet1: null,
    bullet2: null,
    rootCategoryId: null,
    rootCategoryBsr: null,
    thumbnailUrl: null,
    keepa: null,
    fetchedAt: '2026-08-08T12:00:00.000Z',
});
