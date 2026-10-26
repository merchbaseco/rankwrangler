import type { Context } from '@/api/context';
import { publicAppRouter } from '@/api/router-public';
import {
    type KeywordGetMcpInput,
    type KeywordResultsMcpInput,
    type KeywordSearchMcpInput,
    type ProductGetManyMcpInput,
    type ProductGetMcpInput,
    type ProductHistoryMcpInput,
    type ProductSearchMcpInput,
    RANKWRANGLER_MCP_STATUS,
    type RankWranglerMcpDataSource,
} from './types';

export const createRankWranglerMcpDataSource = (ctx: Context): RankWranglerMcpDataSource => {
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
                data: await caller.product.search(input),
                operation: 'search',
            }),
            history: async (input: ProductHistoryMcpInput) => ({
                data: await caller.product.history(toProductHistoryInput(input)),
                operation: 'history',
            }),
        },
        keyword: {
            results: async (input: KeywordResultsMcpInput) => ({
                data: await caller.keyword.results(input),
                operation: 'results',
            }),
            get: async (input: KeywordGetMcpInput) => ({
                data: await caller.keyword.get(input),
                operation: 'get',
            }),
            search: async (input: KeywordSearchMcpInput) => ({
                data: await caller.keyword.search(input),
                operation: 'search',
            }),
        },
    };
};

const toProductHistoryInput = ({ startAt, endAt, ...input }: ProductHistoryMcpInput) => ({
    ...input,
    ...(startAt ? { startAt: new Date(startAt) } : {}),
    ...(endAt ? { endAt: new Date(endAt) } : {}),
});
