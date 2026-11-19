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
    it('answers from a reusable Search run without waiting for Products', async () => {
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
                    isMerchListing: false,
                    category: null,
                    keepa: null,
                    rootCategoryBsr: null,
                }),
            }),
        ]);
        const getRun = mock((_runId: string, options?: { fetchPolicy?: string }) => {
            expect(options?.fetchPolicy).toBe('last-known');
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
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:01.000Z'),
            },
            deps
        );

        expect(result).toEqual({
            runId: run.id,
            searchedAt: '2026-08-06T12:00:00.000Z',
            resultCount: 2,
        });
        expect(deps.resolveRequest.mock.calls[0]?.[0].maxAgeSeconds).toBe(86_400);
    });

    it('answers from a stale run at once and leaves its refresh to background work', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const operation = createPendingOperation();
        const getRun = mock((runId: string, options?: { fetchPolicy?: string }) => {
            expect(runId).toBe(staleRun.id);
            expect(options?.fetchPolicy).toBe('last-known');
            return Promise.resolve(staleRun);
        });
        const deps = createDeps({
            resolveRequest: async input => {
                expect(input.serveStale).toBe(true);
                return {
                    kind: 'pending' as const,
                    operation,
                    created: true,
                    staleRunId: staleRun.id,
                };
            },
            getRun,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'shirts',
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result.searchedAt).toBe(staleRun.sourceCompletedAt);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(deps.getOperationById.mock.calls).toHaveLength(0);
    });

    it('waits for a missing Search run and answers with the completed run', async () => {
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
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result).toEqual({
            runId: run.id,
            searchedAt: '2026-08-06T12:00:02.000Z',
            resultCount: 1,
        });
        expect(operationReads).toBe(2);
    });

    it('answers from stale evidence during a retry cooldown', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'cooldown' as const,
                retryAfterSeconds: 120,
                staleRunId: staleRun.id,
            }),
            getRun: async () => staleRun,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'cooldown shirts',
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
            },
            deps
        );

        expect(result.searchedAt).toBe(staleRun.sourceCompletedAt);
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
