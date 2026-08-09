import { describe, expect, it, mock } from 'bun:test';
import { awaitCatalogSearchRetrieval } from './catalog-search-retrieval';
import {
    createCompletedOperation,
    createDeps,
    createPendingOperation,
    createProduct,
    createRun,
    createSearchResult,
} from './catalog-search-retrieval-test-fixtures';

describe('Product-search retrieval policy', () => {
    it('returns the exact compact projection from a reusable Search run', async () => {
        const run = createRun('2026-08-06T12:00:00.000Z', [
            createSearchResult({
                asin: 'B012345678',
                sourcePosition: 3,
                product: createProduct({
                    asin: 'B012345678',
                    thumbnail: { status: 'available', url: 'https://example.com/image.jpg' },
                }),
            }),
            createSearchResult({
                asin: 'B087654321',
                sourcePosition: 7,
                product: createProduct({
                    asin: 'B087654321',
                    title: null,
                    brand: null,
                    thumbnail: { status: 'unavailable' },
                    isMerchListing: null,
                    category: null,
                    keepa: null,
                    rootCategoryBsr: null,
                }),
            }),
        ]);
        const getRun = mock((_runId: string, options?: { fetchPolicy?: string }) => {
            expect(options?.fetchPolicy).toBe('blocking');
            return Promise.resolve(run);
        });
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'ready' as const,
                runId: run.id,
            }),
            getRun,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: ' Retro   Gardening Shirt ',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:01.000Z'),
            },
            deps
        );

        expect(result).toEqual({
            keyword: 'shirts',
            searchedAt: '2026-08-06T12:00:00.000Z',
            results: [
                {
                    organicSearchPlacement: 3,
                    product: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: 'B012345678',
                        title: 'Garden shirt',
                        brand: 'Example brand',
                        thumbnail: {
                            status: 'available',
                            url: 'https://example.com/image.jpg',
                        },
                        isMerchListing: true,
                        category: { id: 12_345, name: 'Clothing' },
                        salesRank: 12_345,
                        price: { amountMinor: 1999, currencyCode: 'USD' },
                        boughtInPastMonth: 200,
                    },
                },
                {
                    organicSearchPlacement: 7,
                    product: {
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: 'B087654321',
                        title: null,
                        brand: null,
                        thumbnail: { status: 'unavailable' },
                        isMerchListing: null,
                        category: null,
                        salesRank: null,
                        price: null,
                        boughtInPastMonth: null,
                    },
                },
            ],
        });
        expect(deps.resolveRequest.mock.calls[0]?.[0].maxAgeSeconds).toBe(86_400);
    });

    it('waits for a replacement run even when a stale run is available', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const freshRun = createRun('2026-08-06T12:00:02.000Z');
        const operation = createPendingOperation();
        let operationReads = 0;
        const getRun = mock((runId: string) => {
            expect(runId).toBe(freshRun.id);
            return Promise.resolve(freshRun);
        });
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: true,
                staleRunId: staleRun.id,
            }),
            getOperationById: () => {
                operationReads += 1;
                return Promise.resolve(
                    operationReads === 1
                        ? operation
                        : createCompletedOperation(operation, freshRun.id)
                );
            },
            getRun,
            sleep: async () => undefined,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'shirts',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result.searchedAt).toBe(freshRun.sourceCompletedAt);
        expect(operationReads).toBe(2);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(getRun.mock.calls).toHaveLength(1);
    });

    it('waits for a missing Search run and maps the completed result', async () => {
        const operation = createPendingOperation();
        const run = createRun('2026-08-06T12:00:02.000Z');
        let operationReads = 0;
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: true,
                staleRunId: null,
            }),
            getOperationById: () => {
                operationReads += 1;
                return Promise.resolve(
                    operationReads === 1 ? operation : createCompletedOperation(operation, run.id)
                );
            },
            getRun: async () => run,
            sleep: async () => undefined,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'missing shirts',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result.keyword).toBe('shirts');
        expect(result.results).toHaveLength(1);
        expect(result).not.toHaveProperty('run');
        expect(result).not.toHaveProperty('freshness');
        expect(operationReads).toBe(2);
    });

    it('does not return stale evidence during a retry cooldown', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'cooldown' as const,
                retryAfterSeconds: 120,
                staleRunId: staleRun.id,
            }),
        });

        await expect(
            awaitCatalogSearchRetrieval(
                {
                    term: 'cooldown shirts',
                    refresh: false,
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                },
                deps
            )
        ).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            retryAfterSeconds: 120,
        });
        expect(deps.getRun.mock.calls).toHaveLength(0);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(0);
    });

    it('maps a failed Search operation to a retryable error', async () => {
        const operation = createPendingOperation();
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: false,
                staleRunId: null,
            }),
            getOperationById: async () => ({
                ...operation,
                status: 'completed' as const,
                resource: null,
                error: { code: 'PROVIDER_UNAVAILABLE', message: 'temporary failure' },
                completedAt: new Date('2026-08-06T12:00:02.000Z'),
            }),
            sleep: async () => undefined,
        });

        await expect(
            awaitCatalogSearchRetrieval(
                {
                    term: 'failed shirts',
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                },
                deps
            )
        ).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            retryAfterSeconds: 300,
        });
    });

    it('maps a caller deadline while waiting for Search work to a retryable error', async () => {
        const operation = createPendingOperation();
        let clockReads = 0;
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: true,
                staleRunId: null,
            }),
            getOperationById: async () => operation,
            now: () => {
                clockReads += 1;
                return new Date(
                    clockReads === 1 ? '2026-08-06T12:00:00.000Z' : '2026-08-06T18:00:00.000Z'
                );
            },
            sleep: async () => undefined,
        });

        await expect(
            awaitCatalogSearchRetrieval(
                {
                    term: 'deadline shirts',
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                    timeoutMs: 10_000,
                },
                deps
            )
        ).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            reason: 'deadline',
        });
    });
});
