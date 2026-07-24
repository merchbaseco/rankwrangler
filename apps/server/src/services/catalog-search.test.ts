import { describe, expect, it, mock } from 'bun:test';
import { requestCatalogSearch, type CatalogSearchDeps } from './catalog-search';
import type { OperationRecord } from './operations';

describe('Catalog search application workflow', () => {
    it('normalizes query identity while preserving its display term and defaults to 24h reuse', async () => {
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'ready' as const,
                runId: '22222222-2222-4222-8222-222222222222',
            }),
        });

        const result = await requestCatalogSearch(
            { term: '  Retro   Gardening Shirt  ' },
            deps
        );

        expect(deps.resolveRequest.mock.calls[0]?.[0]).toMatchObject({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            page: 0,
            normalizedTerm: 'retro gardening shirt',
            displayTerm: 'Retro Gardening Shirt',
            maxAgeSeconds: 86_400,
        });
        expect(deps.resolveRequest.mock.calls[0]?.[0].priority).toBe('interactive');
        expect(result).toMatchObject({
            response: {
                status: 'ready',
                run: { id: '22222222-2222-4222-8222-222222222222' },
            },
            startedWork: false,
        });
    });

    it('passes maximum age zero while joining and dispatching one pending Operation', async () => {
        const operation = createPendingOperation();
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: false,
            }),
        });

        const result = await requestCatalogSearch(
            { term: 'shirts', maxAgeSeconds: 0 },
            deps
        );

        expect(deps.resolveRequest.mock.calls[0]?.[0].maxAgeSeconds).toBe(0);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(result.response).toMatchObject({
            status: 'pending',
            operation: {
                id: operation.id,
                type: 'catalogSearch',
                status: 'pending',
                retryAfterSeconds: 2,
            },
        });
        expect(result.startedWork).toBe(false);
    });

    it('passes public license accounting into atomic resolution before dispatch', async () => {
        const deps = createDeps();

        const result = await requestCatalogSearch(
            {
                term: 'shirts',
                licenseId: '33333333-3333-4333-8333-333333333333',
            },
            deps
        );

        expect(deps.resolveRequest.mock.calls[0]?.[0]).toMatchObject({
            licenseId: '33333333-3333-4333-8333-333333333333',
        });
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(result.startedWork).toBe(true);
    });

    it('never dispatches work rejected by atomic license accounting', async () => {
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'billingRejected' as const,
                reason: 'usageLimitExceeded' as const,
                usageLimit: 0,
            }),
        });

        await expect(
            requestCatalogSearch(
                {
                    term: 'shirts',
                    licenseId: '33333333-3333-4333-8333-333333333333',
                },
                deps
            )
        ).rejects.toThrow('Daily limit of 0 requests exceeded');

        expect(deps.dispatchOperation.mock.calls).toHaveLength(0);
    });
});

const createDeps = (overrides: Partial<CatalogSearchDeps> = {}): CatalogSearchDeps => ({
    resolveRequest: mock(
        overrides.resolveRequest ??
            (async () => ({
                kind: 'pending' as const,
                operation: createPendingOperation(),
                created: true,
            }))
    ),
    getRun: mock(
        overrides.getRun ??
            (async (runId: string) => ({
                id: runId,
                results: [],
            }))
    ),
    dispatchOperation: mock(overrides.dispatchOperation ?? (async () => true)),
});

const createPendingOperation = (): OperationRecord => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'catalogSearch',
    status: 'pending',
    targetKey: 'query-1',
    input: {
        queryId: 'query-1',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'shirts',
        page: 0,
        priority: 'interactive',
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});
