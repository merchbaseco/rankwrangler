import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { productSearchInput } from '@/api/product-search-input';
import { createRankWranglerMcpDataSource, type McpProductSearchDeps } from './data-source';

describe('MCP Product search data source', () => {
    it('debits once and searches with the collection fallback as the calling account', async () => {
        const deps = createDeps();
        const source = createRankWranglerMcpDataSource(createMcpContext(), deps);

        const result = await source.product.search(
            productSearchInput.parse({ term: 'bruh thanksgiving' })
        );

        expect(result).toEqual({ operation: 'search', data: emptyPage });
        expect(deps.consumeServiceAccountUsageForRequest.mock.calls).toHaveLength(1);
        expect(deps.searchProducts.mock.calls[0]?.[0]).toMatchObject({
            term: 'bruh thanksgiving',
        });
        expect(deps.searchProducts.mock.calls[0]?.[1]).toEqual({
            serviceAccountId: '11111111-1111-4111-8111-111111111111',
            ownerMerchbaseUserId: 'mbu_test',
        });
    });

    it('does not search when the allowance is exhausted', async () => {
        const deps = createDeps();
        deps.consumeServiceAccountUsageForRequest.mockImplementation(async () => {
            throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Daily limit exceeded.' });
        });
        const source = createRankWranglerMcpDataSource(createMcpContext(), deps);

        await expect(
            source.product.search(productSearchInput.parse({ term: 'fishing' }))
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
        expect(deps.searchProducts).not.toHaveBeenCalled();
    });

    it('rejects a context without RankWrangler access before debiting', async () => {
        const deps = createDeps();
        const source = createRankWranglerMcpDataSource(
            { ...createMcpContext(), accessPrincipal: null } as Context,
            deps
        );

        await expect(
            source.product.search(productSearchInput.parse({ term: 'fishing' }))
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(deps.consumeServiceAccountUsageForRequest).not.toHaveBeenCalled();
    });
});

const emptyPage = { items: [], nextCursor: null, coverage: null };

const createDeps = () => ({
    searchProducts: mock<McpProductSearchDeps['searchProducts']>(async () => emptyPage as never),
    consumeServiceAccountUsageForRequest: mock<
        McpProductSearchDeps['consumeServiceAccountUsageForRequest']
    >(async () => undefined),
});

const createMcpContext = () =>
    ({
        user: { sub: 'mbu_test' },
        isAdmin: false,
        authType: 'access',
        credentialKind: 'oauth',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_test',
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
