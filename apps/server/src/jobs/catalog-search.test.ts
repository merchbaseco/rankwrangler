import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { OperationRecord } from '@/services/operations';

describe('Catalog search worker', () => {
    it('normalizes one provider response and reconciles accepted Products atomically', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
            searchProvider: async () => ({
                products: [
                    {
                        asin: 'B0MERCH001',
                        features: [
                            'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                            'Catalog seller detail',
                        ],
                        stats: { current: [-1, 1999, -1, 54_321] },
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
                    refillInMs: 3000,
                    refillRate: 20,
                },
            }),
        });

        const result = await runCatalogSearchOperation(createOperation().id, deps);

        expect(result).toEqual({ didWork: true, status: 'completed', resultCount: 2 });
        expect(deps.searchProvider.mock.calls).toHaveLength(1);
        expect(deps.searchProvider.mock.calls[0]?.[0]).toMatchObject({
            priority: 'interactive',
        });
        expect(deps.persistSuccess.mock.calls).toHaveLength(1);
        expect(deps.persistSuccess.mock.calls[0]?.[0].results).toMatchObject([
            {
                sourcePosition: 1,
                normalized: {
                    product: {
                        asin: 'B0MERCH001',
                        isMerchListing: true,
                        bullet1: 'Catalog seller detail',
                    },
                },
            },
            { sourcePosition: 3, normalized: { product: { asin: 'B0MERCH002' } } },
        ]);
        expect(deps.completeWithError.mock.calls).toHaveLength(0);
        expect(deps.notifyCompleted.mock.calls).toEqual([
            [
                {
                    operationId: '11111111-1111-4111-8111-111111111111',
                    queryId: '22222222-2222-4222-8222-222222222222',
                },
            ],
        ]);
    });

    it('completes failure with a sanitized error and never persists a partial run', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
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
        expect(deps.notifyCompleted.mock.calls).toEqual([
            [
                {
                    operationId: '11111111-1111-4111-8111-111111111111',
                    queryId: '22222222-2222-4222-8222-222222222222',
                },
            ],
        ]);
    });

    it('persists a visible zero-result run', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
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

    it('persists a successful Catalog run without coupling persistence to Product enrichment', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
            searchProvider: async () => ({
                products: [{ asin: 'B0MERCH001' }],
                internalUsage: {
                    tokensConsumed: 10,
                    tokensLeft: 90,
                    refillInMs: 3000,
                    refillRate: 20,
                },
            }),
        });

        expect(await runCatalogSearchOperation(createOperation().id, deps)).toEqual({
            didWork: true,
            status: 'completed',
            resultCount: 1,
        });
        expect(deps.completeWithError.mock.calls).toHaveLength(0);
        expect(deps.notifyCompleted.mock.calls).toHaveLength(1);
    });

    it('releases claimed work when access verification is unavailable', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
            evaluateAccess: async () => ({ kind: 'unavailable' as const }),
            releaseOperationWork: async () => undefined,
        });

        expect(await runCatalogSearchOperation(createOperation().id, deps)).toEqual({
            didWork: false,
            status: 'skipped_access_unavailable',
        });
        expect(deps.releaseOperationWork.mock.calls).toEqual([
            ['11111111-1111-4111-8111-111111111111'],
        ]);
        expect(deps.searchProvider.mock.calls).toHaveLength(0);
    });

    it('does not run interactive work without an explicit owner', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
        const operation = {
            ...createOperation(),
            input: {
                ...createOperation().input,
                ownerMerchbaseUserId: undefined,
            },
        } as OperationRecord;
        const deps = createDeps({
            claimOperationWork: async () => operation,
            releaseOperationWork: async () => undefined,
        });

        expect(await runCatalogSearchOperation(operation.id, deps)).toEqual({
            didWork: false,
            status: 'skipped_access_unavailable',
        });
        expect(deps.releaseOperationWork.mock.calls).toEqual([[operation.id]]);
        expect(deps.evaluateAccess.mock.calls).toHaveLength(0);
        expect(deps.searchProvider.mock.calls).toHaveLength(0);
    });

    it('completes claimed work with a sanitized denial when access is revoked', async () => {
        const { runCatalogSearchOperation } = await loadSubject();
        const deps = createDeps({
            claimOperationWork: async () => createOperation(),
            evaluateAccess: async () => ({ kind: 'denied' as const }),
        });

        expect(await runCatalogSearchOperation(createOperation().id, deps)).toEqual({
            didWork: true,
            status: 'skipped_access_denied',
        });
        expect(deps.completeWithError.mock.calls[0]?.[0].error).toEqual({
            code: 'ACCESS_DENIED',
            message: 'RankWrangler access is no longer granted.',
        });
        expect(deps.searchProvider.mock.calls).toHaveLength(0);
    });
});

const createDeps = (overrides: Record<string, unknown> = {}) => ({
    claimOperationWork: mock(async () => createOperation()),
    searchProvider: mock(async () => ({
        products: [],
        internalUsage: {
            tokensConsumed: 10,
            tokensLeft: 90,
            refillInMs: 3000,
            refillRate: 20,
        },
    })),
    persistSuccess: mock(
        async ({
            results,
        }: {
            results: Array<{ normalized: { product: { marketplaceId: string; asin: string } } }>;
        }) => ({
            runId: 'run-1',
        })
    ),
    completeWithError: mock(async () => createOperation()),
    evaluateAccess: mock(async () => ({ kind: 'allowed' as const })),
    releaseOperationWork: mock(async () => undefined),
    notifyCompleted: mock(() => {
        // Completion delivery is asserted through mock calls.
    }),
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
        priority: 'interactive',
        trigger: 'requested',
        ownerMerchbaseUserId: 'mbu_test',
    },
    resource: null,
    error: null,
    dispatchedAt: new Date('2026-07-23T12:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./catalog-search');
};

const seedRequiredEnvForTests = () => {
    process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN = process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.RANKWRANGLER_SPAPI_CLIENT_ID = process.env.RANKWRANGLER_SPAPI_CLIENT_ID ?? 'test-client';
    process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET = process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.MERCHBASE_CLERK_SECRET_KEY = process.env.MERCHBASE_CLERK_SECRET_KEY ?? 'test-clerk';
    process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY = process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY ?? 'pk_test_rankwrangler';
    process.env.MERCHBASE_CLERK_JWT_KEY = process.env.MERCHBASE_CLERK_JWT_KEY ?? 'test-jwt-key';
    process.env.MERCHBASE_CLERK_ISSUER = process.env.MERCHBASE_CLERK_ISSUER ?? 'https://clerk.test';
    process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES =
        process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
