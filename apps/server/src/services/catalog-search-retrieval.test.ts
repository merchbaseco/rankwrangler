import { describe, expect, it, mock } from 'bun:test';
import {
    awaitCatalogSearchRetrieval,
    type CatalogSearchRetrievalDeps,
} from './catalog-search-retrieval';
import type { OperationRecord } from './operations';

describe('Product-search retrieval policy', () => {
    it('returns a reusable Search run with fresh Search-run evidence', async () => {
        const run = createRun('2026-08-06T12:00:00.000Z');
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'ready' as const,
                runId: run.id,
            }),
            getRun: async () => run,
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

        expect(result).toMatchObject({
            status: 'ready',
            run,
            freshness: {
                stale: false,
                updatedAt: '2026-08-06T12:00:00.000Z',
            },
        });
        expect(deps.dispatchOperation.mock.calls).toHaveLength(0);
        expect(deps.resolveRequest.mock.calls[0]?.[0].maxAgeSeconds).toBe(86_400);
    });

    it('returns stale evidence immediately while default search revalidates in the background', async () => {
        const run = createRun('2026-08-05T11:00:00.000Z');
        const operation = createPendingOperation();
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: true,
                staleRunId: run.id,
            }),
            getRun: async () => run,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'background shirts',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result.freshness).toEqual({
            stale: true,
            updatedAt: '2026-08-05T11:00:00.000Z',
        });
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(deps.getOperationById.mock.calls).toHaveLength(0);
    });

    it('waits for fresh Search evidence when refresh is requested', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const freshRun = createRun(
            '2026-08-06T12:00:02.000Z',
            '44444444-4444-4444-8444-444444444444'
        );
        const operation = createPendingOperation();
        let operationReads = 0;
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
            getRun: async runId => (runId === staleRun.id ? staleRun : freshRun),
            sleep: async () => undefined,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'fresh shirts',
                refresh: true,
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result.run).toBe(freshRun);
        expect(result.freshness.stale).toBe(false);
        expect(deps.getOperationById.mock.calls).toHaveLength(2);
    });

    it('waits for a missing Search run and returns the completed run', async () => {
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

        expect(result.run).toBe(run);
        expect(result.freshness.stale).toBe(false);
        expect(deps.getOperationById.mock.calls).toHaveLength(2);
    });

    it('coalesces equivalent refresh callers onto one Search-run wait', async () => {
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

        const [first, second] = await Promise.all([
            awaitCatalogSearchRetrieval(
                {
                    term: ' Coalesced   Gardening Shirt ',
                    refresh: true,
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                    now: new Date('2026-08-06T12:00:00.000Z'),
                },
                deps
            ),
            awaitCatalogSearchRetrieval(
                {
                    term: 'coalesced gardening shirt',
                    refresh: true,
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                    now: new Date('2026-08-06T12:00:00.000Z'),
                },
                deps
            ),
        ]);

        expect(first.run).toBe(run);
        expect(second.run).toBe(run);
        expect(deps.resolveRequest.mock.calls).toHaveLength(1);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(deps.getOperationById.mock.calls).toHaveLength(2);
    });

    it('fails a refresh during the durable retry cooldown without dispatching work', async () => {
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'cooldown' as const,
                retryAfterSeconds: 120,
                staleRunId: null,
            }),
        });

        await expect(
            awaitCatalogSearchRetrieval(
                {
                    term: 'cooldown shirts',
                    refresh: true,
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                },
                deps
            )
        ).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            retryAfterSeconds: 120,
        });
        expect(deps.dispatchOperation.mock.calls).toHaveLength(0);
    });
});
const createDeps = (
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
});

const createRun = (sourceCompletedAt: string, id = '22222222-2222-4222-8222-222222222222') => ({
    id,
    sourceStartedAt: '2026-08-06T11:59:00.000Z',
    sourceCompletedAt,
    trigger: 'requested' as const,
    resultCount: 1,
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
    results: [],
});

type CatalogSearchOperation = Extract<OperationRecord, { type: 'catalogSearch' }>;
const createPendingOperation = (): CatalogSearchOperation => ({
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

const createCompletedOperation = (operation: CatalogSearchOperation, runId: string) => ({
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
