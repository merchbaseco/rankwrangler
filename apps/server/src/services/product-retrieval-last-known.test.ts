import { describe, expect, it, mock } from 'bun:test';
import { getBasicProductReadModels } from './basic-product-read-model';
import { getProducts } from './product-retrieval';
import { RetrievalRetryableError } from './retrieval-coordinator';

describe('Product retrieval with last-known policy', () => {
    it('serves a stale known listing without waiting on a stalled provider', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0LASTKN01' };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(1));
        const searchCatalogItemsByAsins = mock(() => new Promise<never>(() => undefined));
        const deps = createDeps({
            stored: [
                {
                    product: createStoredProduct(identity, {
                        title: 'Last-known title',
                        thumbnailUrl: 'https://example.com/last-known.jpg',
                        spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                    }),
                    queuePending: false,
                },
            ],
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
        });

        const [result] = await getProducts(
            { products: [identity], fetchPolicy: 'last-known', timeoutMs: 60_000 },
            deps
        );

        expect(result).toMatchObject({
            amazonListingStatus: 'active',
            product: {
                title: 'Last-known title',
                thumbnail: { status: 'available', url: 'https://example.com/last-known.jpg' },
            },
        });
        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(enqueueSpApiSyncQueueItems).toHaveBeenCalledWith([identity]);
    });

    it('lets getMany return a stale known listing while the provider is stalled', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0LASTKN04' };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(1));
        const searchCatalogItemsByAsins = mock(() => new Promise<never>(() => undefined));
        const deps = createDeps({
            stored: [
                {
                    product: createStoredProduct(identity, {
                        title: 'Known title',
                        spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                    }),
                    queuePending: false,
                },
            ],
            enqueueSpApiSyncQueueItems,
            searchCatalogItemsByAsins,
        });

        const result = await getBasicProductReadModels(
            { products: [identity] },
            { getProducts: input => getProducts(input, deps) }
        );

        expect(result).toEqual([
            {
                ...identity,
                title: 'Known title',
                thumbnail: { status: 'unavailable' },
                amazonListingStatus: 'active',
            },
        ]);
        expect(searchCatalogItemsByAsins).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(enqueueSpApiSyncQueueItems).toHaveBeenCalledWith([identity]);
    });

    it('does not requeue a known listing whose refresh is already queued', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0LASTKN02' };
        const enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(1));
        const deps = createDeps({
            stored: [
                {
                    product: createStoredProduct(identity, {
                        spApiFetchedAt: new Date('2026-07-01T12:00:00.000Z'),
                    }),
                    queuePending: true,
                },
            ],
            enqueueSpApiSyncQueueItems,
        });

        await getProducts({ products: [identity], fetchPolicy: 'last-known' }, deps);
        await Promise.resolve();

        expect(enqueueSpApiSyncQueueItems).not.toHaveBeenCalled();
    });

    it('waits for an unknown Product and fails retryably at the caller deadline', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B0LASTKN03' };
        const searchCatalogItemsByAsins = mock(() => new Promise<never>(() => undefined));
        const deps = createDeps({ stored: [], searchCatalogItemsByAsins });

        const read = getProducts(
            { products: [identity], fetchPolicy: 'last-known', timeoutMs: 20 },
            deps
        );

        await expect(read).rejects.toBeInstanceOf(RetrievalRetryableError);
        expect(searchCatalogItemsByAsins).toHaveBeenCalledWith('ATVPDKIKX0DER', [identity.asin]);
    });
});

const createDeps = ({
    stored,
    enqueueSpApiSyncQueueItems = mock(() => Promise.resolve(0)),
    searchCatalogItemsByAsins = mock(() => Promise.resolve([])),
}: {
    stored: unknown[];
    enqueueSpApiSyncQueueItems?: ReturnType<typeof mock>;
    searchCatalogItemsByAsins?: ReturnType<typeof mock>;
}) =>
    ({
        getStoredProducts: mock(() => Promise.resolve(stored)),
        ensureProductIdentities: mock(() => Promise.resolve(0)),
        enqueueSpApiSyncQueueItems,
        searchCatalogItemsByAsins,
        persistProductSyncResults: mock(() => Promise.resolve(undefined)),
    }) as never;

const createStoredProduct = (
    { marketplaceId, asin }: { marketplaceId: string; asin: string },
    overrides: Record<string, unknown> = {}
) => ({
    marketplaceId,
    asin,
    dateFirstAvailable: null,
    thumbnailUrl: null,
    title: 'Stored title',
    brand: null,
    isMerchListing: false,
    amazonListingStatus: 'active',
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
});
