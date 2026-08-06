import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator';
import { createProductSearchProcedure, type ProductSearchProcedureDeps } from './product-search';

describe('public Product-search tRPC boundary', () => {
    it('returns Search-run data and freshness without exposing an Operation', async () => {
        const response = {
            status: 'ready' as const,
            run: { id: '22222222-2222-4222-8222-222222222222' },
            freshness: {
                stale: false,
                updatedAt: '2026-08-06T12:00:00.000Z',
            },
        };
        const retrieveProductSearch = mock(async () => response);
        const caller = createCaller({ retrieveProductSearch });

        const result = await caller.search({ term: 'shirts', refresh: true });

        expect(result).toEqual(response);
        expect(result).not.toHaveProperty('operation');
        expect(retrieveProductSearch.mock.calls[0]?.[0]).toMatchObject({
            term: 'shirts',
            refresh: true,
            ownerMerchbaseUserId: 'mbu_test',
        });
    });

    it('maps temporary Search-run retrieval failure to a provider-neutral retryable error', async () => {
        const caller = createCaller({
            retrieveProductSearch: mock(() => {
                throw new RetrievalRetryableError(
                    'Product search is temporarily unavailable. Retry shortly.',
                    { retryAfterSeconds: 9, reason: 'capacity' }
                );
            }),
        });

        const error = await caller.search({ term: 'shirts' }).catch(reason => reason);

        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Product search is temporarily unavailable. Retry after 9 seconds.',
        });
    });
});

const createCaller = (overrides: Partial<ProductSearchProcedureDeps> = {}) =>
    router({
        search: createProductSearchProcedure({
            retrieveProductSearch: mock(
                overrides.retrieveProductSearch ??
                    (async () => ({
                        status: 'ready' as const,
                        run: { id: '22222222-2222-4222-8222-222222222222' },
                        freshness: {
                            stale: false,
                            updatedAt: '2026-08-06T12:00:00.000Z',
                        },
                    }))
            ),
        }),
    }).createCaller(createPublicContext());

const createPublicContext = () =>
    ({
        user: { sub: 'mbu_test' },
        isAdmin: false,
        authType: 'access',
        credentialKind: 'api_key',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
            usageToday: 0,
            usageCount: 0,
            usageLimit: 100,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
