import { describe, expect, it, mock } from 'bun:test';
import { getProducts } from './product-retrieval';

describe('Product retrieval', () => {
    it('returns cached Products as pending and batch-enqueues without a provider fetch', async () => {
        const identities = [
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' },
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' },
        ];
        let readCount = 0;
        const getStoredProducts = mock(async () => {
            readCount += 1;
            return identities.map(identity => ({
                product: createStoredProduct(identity),
                queuePending: readCount > 1,
            }));
        });
        const searchCatalogItemsByAsins = mock(async () => []);
        const enqueueSpApiSyncQueueItems = mock(async () => identities.length);
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(async () => 0),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(async () => undefined),
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
            getStoredProducts: mock(async () => [
                {
                    product: createStoredProduct(identity),
                    queuePending: false,
                },
            ]),
            ensureProductIdentities: mock(async () => 0),
            enqueueSpApiSyncQueueItems: mock(async () => {
                throw new Error('queue offline');
            }),
            searchCatalogItemsByAsins: mock(async () => []),
            persistProductSyncResults: mock(async () => undefined),
        } as never;

        await expect(
            getProducts({ products: [identity], fetchPolicy: 'background' }, deps)
        ).rejects.toThrow('queue offline');
    });

    it('blocks regular Product reads through the same service until provider data is resolved', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000003' };
        let readCount = 0;
        const getStoredProducts = mock(async () => {
            readCount += 1;
            return [
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
            ];
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
        const enqueueSpApiSyncQueueItems = mock(async () => 0);
        const searchCatalogItemsByAsins = mock(async () => [providerProduct]);
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(async () => 0),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(async () => undefined),
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
        const getStoredProducts = mock(async () => {
            readCount += 1;
            return [
                {
                    product: createStoredProduct(identity, {
                        spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                        thumbnailUrl: 'https://example.com/stale.jpg',
                    }),
                    queuePending: readCount > 1,
                },
            ];
        });
        const enqueueSpApiSyncQueueItems = mock(async () => 1);
        const searchCatalogItemsByAsins = mock(async () => []);
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(async () => 0),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(async () => undefined),
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
        const enqueueSpApiSyncQueueItems = mock(async () => 0);
        const searchCatalogItemsByAsins = mock(async () => []);
        const deps = {
            getStoredProducts: mock(async () => [
                {
                    product: createStoredProduct(identity, {
                        spApiResolvedAt: new Date('2026-08-03T12:00:00.000Z'),
                    }),
                    queuePending: false,
                },
            ]),
            ensureProductIdentities: mock(async () => 0),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
            persistProductSyncResults: mock(async () => undefined),
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

    it('treats a newer empty resolution as unavailable over older listing data', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000006' };
        const enqueueSpApiSyncQueueItems = mock(async () => 0);
        const getStoredProducts = mock(async () => [
            {
                product: createStoredProduct(identity, {
                    thumbnailUrl: 'https://example.com/old.jpg',
                    spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                    spApiResolvedAt: new Date('2026-08-03T12:00:00.000Z'),
                }),
                queuePending: false,
            },
        ]);
        const deps = {
            getStoredProducts,
            ensureProductIdentities: mock(async () => 0),
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins: mock(async () => []),
            persistProductSyncResults: mock(async () => undefined),
        } as never;

        const [result] = await getProducts(
            { products: [identity], fetchPolicy: 'background' },
            deps
        );

        expect(enqueueSpApiSyncQueueItems).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            availability: 'unavailable',
            product: { thumbnail: { status: 'unavailable' } },
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
