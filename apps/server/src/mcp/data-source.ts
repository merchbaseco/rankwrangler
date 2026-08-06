import type { Context } from '@/api/context';
import { publicAppRouter } from '@/api/router-public';
import {
    type KeywordGetMcpInput,
    type KeywordHistoryMcpInput,
    type KeywordSearchMcpInput,
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
                data: await caller.product.get(toProductInput(input)),
                operation: 'get',
            }),
            search: async (input: ProductSearchMcpInput) => ({
                data: await caller.product.search(input),
                operation: 'search',
            }),
            history: async (input: ProductHistoryMcpInput) => ({
                data: await caller.product.history(toProductInput(input)),
                operation: 'history',
            }),
        },
        keyword: {
            get: async (input: KeywordGetMcpInput) => ({
                data: await caller.keyword.get(input),
                operation: 'get',
            }),
            search: async (input: KeywordSearchMcpInput) => ({
                data: await caller.keyword.search(input),
                operation: 'search',
            }),
            history: async (input: KeywordHistoryMcpInput) => ({
                data: await caller.keyword.history(input),
                operation: 'history',
            }),
        },
    };
};

const toProductInput = ({
    startAt,
    endAt,
    ...input
}: ProductGetMcpInput | ProductHistoryMcpInput) => ({
    ...input,
    ...(startAt ? { startAt: new Date(startAt) } : {}),
    ...(endAt ? { endAt: new Date(endAt) } : {}),
});
