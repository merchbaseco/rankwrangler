import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator';
import { createProductSearchProcedure, type ProductSearchProcedureDeps } from './product-search';

describe('public Product-search tRPC boundary', () => {
    it('returns the exact compact Product Search contract without retrieval metadata', async () => {
        const response = {
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
                            status: 'available' as const,
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
                        thumbnail: { status: 'unavailable' as const },
                        isMerchListing: null,
                        category: null,
                        salesRank: null,
                        price: null,
                        boughtInPastMonth: null,
                    },
                },
            ],
        };
        const retrieveProductSearch = mock(async () => response);
        const caller = createCaller({ retrieveProductSearch });

        const result = await caller.search({ term: 'shirts', refresh: true });

        expect(result).toEqual(response);
        expect(Object.keys(result)).toEqual(['keyword', 'searchedAt', 'results']);
        expect(Object.keys(result.results[0] ?? {})).toEqual(['organicSearchPlacement', 'product']);
        expect(Object.keys(result.results[0]?.product ?? {})).toEqual([
            'marketplaceId',
            'asin',
            'title',
            'brand',
            'thumbnail',
            'isMerchListing',
            'category',
            'salesRank',
            'price',
            'boughtInPastMonth',
        ]);
        expect(result).not.toHaveProperty('status');
        expect(result).not.toHaveProperty('run');
        expect(result).not.toHaveProperty('freshness');
        expect(result).not.toHaveProperty('operation');
        expect(retrieveProductSearch.mock.calls[0]?.[0]).toMatchObject({
            term: 'shirts',
            refresh: true,
            ownerMerchbaseUserId: 'mbu_test',
        });
    });

    it('preserves a retryable provider-neutral Search error', async () => {
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
                        keyword: 'shirts',
                        searchedAt: '2026-08-06T12:00:00.000Z',
                        results: [],
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
