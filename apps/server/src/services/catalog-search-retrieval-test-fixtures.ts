import { mock } from 'bun:test';
import type { ProductInfo } from '@/types';
import type { CatalogSearchRetrievalDeps } from './catalog-search-retrieval';
import type { OperationRecord } from './operations';

export const createDeps = (
    overrides: Partial<CatalogSearchRetrievalDeps> = {}
): CatalogSearchRetrievalDeps => ({
    resolveRequest: mock(
        overrides.resolveRequest ??
            (async () => ({
                kind: 'ready' as const,
                runId: '22222222-2222-4222-8222-222222222222',
            }))
    ),
    getRun: mock(overrides.getRun ?? (async () => createRun('2026-08-06T12:00:00.000Z'))),
    getOperationById: mock(overrides.getOperationById ?? (async () => null)),
    dispatchOperation: mock(overrides.dispatchOperation ?? (async () => true)),
    sleep: mock(overrides.sleep ?? (async () => undefined)),
    ...(overrides.now ? { now: overrides.now } : {}),
});

export const createRun = (
    sourceCompletedAt: string,
    results = [createSearchResult({ asin: 'B012345678', sourcePosition: 1 })],
    id = '22222222-2222-4222-8222-222222222222'
) => ({
    id,
    sourceStartedAt: '2026-08-06T11:59:00.000Z',
    sourceCompletedAt,
    trigger: 'requested' as const,
    resultCount: results.length,
    normalizerVersion: 1,
    createdAt: sourceCompletedAt,
    query: {
        id: '33333333-3333-4333-8333-333333333333',
        source: 'keepa' as const,
        marketplaceId: 'ATVPDKIKX0DER',
        normalizedTerm: 'shirts',
        displayTerm: 'shirts',
        page: 0,
    },
    results,
});

export const createSearchResult = ({
    asin,
    sourcePosition,
    product = createProduct({ asin }),
}: {
    asin: string;
    sourcePosition: number;
    product?: ProductInfo;
}) => ({
    productId: `product-${asin}`,
    position: { source: 'keepa' as const, value: sourcePosition },
    observed: {
        rootCategoryBsr: null,
        newPriceAmountMinor: null,
        currencyCode: 'USD' as const,
        monthlySold: null,
        averageRootCategoryBsr30: null,
        averageRootCategoryBsr90: null,
        salesRankDrops: { days30: null, days90: null, days180: null, days365: null },
        sourceUpdatedAt: null,
    },
    currentProduct: product,
    currentProductAvailability: 'available' as const,
});

export const createProduct = ({
    asin,
    title = 'Garden shirt',
    brand = 'Example brand',
    thumbnail = { status: 'available' as const, url: 'https://example.com/image.jpg' },
    isMerchListing = true,
    category = { id: 12_345, name: 'Clothing' },
    rootCategoryBsr = 12_345,
    keepa = {
        fetchedAt: '2026-08-06T11:00:00.000Z',
        sourceUpdatedAt: '2026-08-06T10:00:00.000Z',
        firstTrackedAt: '2026-01-01T00:00:00.000Z',
        rootCategoryId: 12_345,
        currentRootCategoryBsr: 12_345,
        currentNewPrice: { amountMinor: 1999, currencyCode: 'USD' },
        monthlySold: 200,
        averageRootCategoryBsr30: 15_000,
        averageRootCategoryBsr90: 18_000,
        salesRankDrops: { days30: 4, days90: 11, days180: 19, days365: 31 },
    },
}: {
    asin: string;
    title?: string | null;
    brand?: string | null;
    thumbnail?: ProductInfo['thumbnail'];
    isMerchListing?: boolean | null;
    category?: { id: number; name: string | null } | null;
    rootCategoryBsr?: number | null;
    keepa?: ProductInfo['keepa'];
}) =>
    ({
        asin,
        marketplaceId: 'ATVPDKIKX0DER',
        dateFirstAvailable: '2026-01-01T00:00:00.000Z',
        title,
        brand,
        isMerchListing,
        isUnavailable: false,
        bullet1: null,
        bullet2: null,
        rootCategoryId: category?.id ?? null,
        rootCategoryBsr,
        rootCategoryDisplayName: category?.name ?? null,
        thumbnail,
        keepa,
        freshness: { stale: false, updatedAt: '2026-08-06T11:00:00.000Z' },
    }) satisfies ProductInfo;

type CatalogSearchOperation = Extract<OperationRecord, { type: 'catalogSearch' }>;

export const createPendingOperation = (): CatalogSearchOperation => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'catalogSearch',
    status: 'pending',
    targetKey: '33333333-3333-4333-8333-333333333333',
    input: {
        queryId: '33333333-3333-4333-8333-333333333333',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'shirts',
        page: 0,
        priority: 'interactive',
        trigger: 'requested',
        ownerMerchbaseUserId: 'mbu_test',
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-06T12:00:00.000Z'),
    updatedAt: new Date('2026-08-06T12:00:00.000Z'),
});

export const createCompletedOperation = (operation: CatalogSearchOperation, runId: string) => ({
    ...operation,
    status: 'completed' as const,
    resource: {
        type: 'catalogSearchRun' as const,
        queryId: operation.input.queryId,
        runId,
    },
    completedAt: new Date('2026-08-06T12:00:02.000Z'),
    updatedAt: new Date('2026-08-06T12:00:02.000Z'),
});
