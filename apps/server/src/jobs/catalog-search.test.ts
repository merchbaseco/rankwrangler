import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { runCatalogSearchOperation } from './catalog-search';
import type { OperationRecord } from '@/services/operations';

describe('Catalog search worker', () => {
    it('normalizes one provider response and reconciles accepted Products atomically', async () => {
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
            searchProvider: async () => ({
                products: [
                    {
                        asin: 'B0MERCH001',
                        stats: { current: [-1, 1_999, -1, 54_321] },
                    },
                    { asin: 'not-an-asin' },
                    {
                        asin: 'B0MERCH002',
                        stats: { current: [-1, -1, -1, -1] },
                    },
                ],
                internalUsage: {
                    tokensConsumed: 10,
                    tokensLeft: 90,
                    refillInMs: 3_000,
                    refillRate: 20,
                },
            }),
        });

        const result = await runCatalogSearchOperation(createOperation().id, deps);

        expect(result).toEqual({ didWork: true, status: 'completed', resultCount: 2 });
        expect(deps.searchProvider.mock.calls).toHaveLength(1);
        expect(deps.persistSuccess.mock.calls).toHaveLength(1);
        expect(deps.persistSuccess.mock.calls[0]?.[0].results).toMatchObject([
            { sourcePosition: 1, normalized: { product: { asin: 'B0MERCH001' } } },
            { sourcePosition: 3, normalized: { product: { asin: 'B0MERCH002' } } },
        ]);
        expect(deps.completeWithError.mock.calls).toHaveLength(0);
    });

    it('completes failure with a sanitized error and never persists a partial run', async () => {
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
            searchProvider: async () => {
                throw new TRPCError({
                    code: 'BAD_GATEWAY',
                    message: 'provider secret payload',
                });
            },
        });

        expect(await runCatalogSearchOperation(createOperation().id, deps)).toEqual({
            didWork: true,
            status: 'failed',
        });
        expect(deps.persistSuccess.mock.calls).toHaveLength(0);
        expect(deps.completeWithError.mock.calls[0]?.[0].error).toEqual({
            code: 'PROVIDER_UNAVAILABLE',
            message: 'Catalog search failed. Retry the request shortly.',
        });
    });

    it('persists a visible zero-result run', async () => {
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
        });

        expect(await runCatalogSearchOperation(createOperation().id, deps)).toEqual({
            didWork: true,
            status: 'completed',
            resultCount: 0,
        });
        expect(deps.persistSuccess.mock.calls[0]?.[0].results).toEqual([]);
    });
});

const createDeps = (overrides: Record<string, unknown> = {}) => ({
    claimOperationWork: mock(async () => createOperation()),
    searchProvider: mock(async () => ({
        products: [],
        internalUsage: {
            tokensConsumed: 10,
            tokensLeft: 90,
            refillInMs: 3_000,
            refillRate: 20,
        },
    })),
    persistSuccess: mock(async () => ({ runId: 'run-1' })),
    completeWithError: mock(async () => createOperation()),
    ...Object.fromEntries(
        Object.entries(overrides).map(([key, implementation]) => [
            key,
            typeof implementation === 'function' ? mock(implementation) : implementation,
        ])
    ),
});

const createOperation = (): OperationRecord => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'catalogSearch',
    status: 'pending',
    targetKey: '22222222-2222-4222-8222-222222222222',
    input: {
        queryId: '22222222-2222-4222-8222-222222222222',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'retro gardening shirt',
        page: 0,
    },
    resource: null,
    error: null,
    dispatchedAt: new Date('2026-07-23T12:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});
