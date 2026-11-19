import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { consumeServiceAccountUsageForRequest } from '@/api/public/consume-service-account-usage';
import { publicAppRouter } from '@/api/router-public';
import { searchProductsCollectingTerm } from '@/services/product-search-collection';
import { buildContactSheet } from './contact-sheet-images';
import {
    type KeywordGetMcpInput,
    type KeywordListMcpInput,
    type ProductGetManyMcpInput,
    type ProductGetMcpInput,
    type ProductHistoryMcpInput,
    type ProductSearchMcpInput,
    RANKWRANGLER_MCP_STATUS,
    type RankWranglerMcpDataSource,
} from './types';

export interface McpProductSearchDeps {
    searchProducts: typeof searchProductsCollectingTerm;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultSearchDeps: McpProductSearchDeps = {
    searchProducts: searchProductsCollectingTerm,
    consumeServiceAccountUsageForRequest,
};

/**
 * Reads go through the public tRPC procedures, except Product search: MCP search also collects a
 * never-seen term's first Amazon page (see `searchProductsCollectingTerm`). Public tRPC search
 * stays a stored read because the extension calls it on every Amazon search.
 */
export const createRankWranglerMcpDataSource = (
    ctx: Context,
    searchDeps: McpProductSearchDeps = defaultSearchDeps
): RankWranglerMcpDataSource => {
    const caller = publicAppRouter.createCaller(ctx).api.public;

    return {
        status: async () => RANKWRANGLER_MCP_STATUS,
        product: {
            get: async (input: ProductGetMcpInput) => ({
                data: await caller.product.get(input),
                operation: 'get',
            }),
            getMany: async (input: ProductGetManyMcpInput) => ({
                data: await caller.product.getMany(input),
                operation: 'getMany',
            }),
            search: async (input: ProductSearchMcpInput) => ({
                data: await searchCollectingTerm(ctx, input, searchDeps),
                operation: 'search',
            }),
            history: async (input: ProductHistoryMcpInput) => ({
                data: await caller.product.history(toProductHistoryInput(input)),
                operation: 'history',
            }),
            contactSheet: buildContactSheet,
        },
        keyword: {
            get: async (input: KeywordGetMcpInput) => ({
                data: await caller.keyword.get(input),
                operation: 'get',
            }),
            list: async (input: KeywordListMcpInput) => ({
                data: await caller.keyword.list(input),
                operation: 'list',
            }),
        },
    };
};

const toProductHistoryInput = ({ startAt, endAt, ...input }: ProductHistoryMcpInput) => ({
    ...input,
    ...(startAt ? { startAt: new Date(startAt) } : {}),
    ...(endAt ? { endAt: new Date(endAt) } : {}),
});

const searchCollectingTerm = async (
    ctx: Context,
    input: ProductSearchMcpInput,
    deps: McpProductSearchDeps
) => {
    const principal = ctx.accessPrincipal;
    if (ctx.authType !== 'access' || !principal) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'RankWrangler access is required.' });
    }
    await deps.consumeServiceAccountUsageForRequest(ctx, 1);
    return await deps.searchProducts(input, {
        serviceAccountId: principal.id,
        ownerMerchbaseUserId: principal.merchbaseUserId,
    });
};
