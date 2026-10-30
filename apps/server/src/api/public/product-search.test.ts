import { describe, expect, it, mock } from 'bun:test';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { createProductSearchProcedure } from './product-search';

describe('public stored Product search', () => {
    it('returns stored matches with defaults and one usage debit', async () => {
        const response = { items: [], nextCursor: null, coverage: null };
        const searchProducts = mock(async () => response);
        const consumeServiceAccountUsageForRequest = mock(async () => undefined);
        const caller = router({
            search: createProductSearchProcedure({
                searchProducts,
                consumeServiceAccountUsageForRequest,
            }),
        }).createCaller(createPublicContext());
        expect(await caller.search({ term: 'fishing' })).toEqual(response);
        expect(searchProducts.mock.calls[0]?.[0]).toMatchObject({
            term: 'fishing',
            marketplaceIds: ['ATVPDKIKX0DER'],
            isMerchListing: true,
            amazonListingStatus: 'active',
            includeOfficialBrands: false,
            limit: 50,
        });
        expect(consumeServiceAccountUsageForRequest.mock.calls).toHaveLength(1);
    });
    it('rejects inverted ranges before querying or debiting', async () => {
        const searchProducts = mock(async () => ({ items: [], nextCursor: null, coverage: null }));
        const debit = mock(async () => undefined);
        const caller = router({
            search: createProductSearchProcedure({
                searchProducts,
                consumeServiceAccountUsageForRequest: debit,
            }),
        }).createCaller(createPublicContext());
        await expect(caller.search({ salesRank: { min: 100, max: 1 } })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        expect(searchProducts).not.toHaveBeenCalled();
        expect(debit).not.toHaveBeenCalled();
    });
});

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
