import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator';
import { createKeywordResultsProcedure, type KeywordResultsProcedureDeps } from './keyword-results';

describe('public Keyword-results tRPC boundary', () => {
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
                        amazonListingStatus: 'active' as const,
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
                        amazonListingStatus: 'active' as const,
                        category: null,
                        salesRank: null,
                        price: null,
                        boughtInPastMonth: null,
                    },
                },
            ],
        };
        const retrieveKeywordResults = mock(async () => response);
        const caller = createCaller({ retrieveKeywordResults });

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
            'amazonListingStatus',
            'category',
            'salesRank',
            'price',
            'boughtInPastMonth',
        ]);
        expect(result).not.toHaveProperty('status');
        expect(result).not.toHaveProperty('run');
        expect(result).not.toHaveProperty('freshness');
        expect(result).not.toHaveProperty('operation');
        expect(retrieveKeywordResults.mock.calls[0]?.[0]).toMatchObject({
            term: 'shirts',
            refresh: true,
            ownerMerchbaseUserId: 'mbu_test',
        });
    });

    it('preserves a retryable provider-neutral Search error', async () => {
        const caller = createCaller({
            retrieveKeywordResults: mock(() => {
                throw new RetrievalRetryableError(
                    'Keyword results are temporarily unavailable. Retry shortly.',
                    { retryAfterSeconds: 9, reason: 'capacity' }
                );
            }),
        });

        const error = await caller.search({ term: 'shirts' }).catch(reason => reason);

        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Keyword results are temporarily unavailable. Retry after 9 seconds.',
        });
    });
});

const createCaller = (overrides: Partial<KeywordResultsProcedureDeps> = {}) =>
    router({
        search: createKeywordResultsProcedure({
            retrieveKeywordResults: mock(
                overrides.retrieveKeywordResults ??
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
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
