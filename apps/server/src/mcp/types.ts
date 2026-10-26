import type { z } from 'zod';
import type { keywordSearchInput } from '@/api/public/keyword-input';
import type { ProductSearchInput } from '@/api/product-search-input';
import type { ProductGetInclude } from '@/api/public/product-input';

export type ProductHistoryMetric = 'salesRank' | 'price';
export type ProductHistoryBucket = 'auto' | 'day' | 'week' | 'month';

export interface ProductGetMcpInput {
    marketplaceId: string;
    asin: string;
    include?: ProductGetInclude[];
}

export interface ProductGetManyMcpInput {
    products: Pick<ProductGetMcpInput, 'marketplaceId' | 'asin'>[];
}

export type ProductSearchMcpInput = ProductSearchInput;

export interface KeywordResultsMcpInput {
    term: string;
    refresh: boolean;
}

export interface ProductHistoryMcpInput {
    marketplaceId: string;
    asin: string;
    startAt?: string;
    endAt?: string;
    limit: number;
    days: number;
    metrics: ProductHistoryMetric[];
    bucket: ProductHistoryBucket;
}

export interface KeywordGetMcpInput {
    keyword: string;
}

export type KeywordSearchMcpInput = z.input<typeof keywordSearchInput>;

export interface RankWranglerMcpStatus {
    [key: string]: unknown;
    service: 'rankwrangler';
    status: 'ready';
    capabilities: {
        product: ['get', 'getMany', 'search', 'history'];
        keyword: ['get', 'search', 'results'];
    };
}

export interface RankWranglerMcpDataSource {
    status(): Promise<RankWranglerMcpStatus>;
    product: {
        get(input: ProductGetMcpInput): Promise<Record<string, unknown>>;
        getMany(input: ProductGetManyMcpInput): Promise<Record<string, unknown>>;
        search(input: ProductSearchMcpInput): Promise<Record<string, unknown>>;
        history(input: ProductHistoryMcpInput): Promise<Record<string, unknown>>;
    };
    keyword: {
        results(input: KeywordResultsMcpInput): Promise<Record<string, unknown>>;
        get(input: KeywordGetMcpInput): Promise<Record<string, unknown>>;
        search(input: KeywordSearchMcpInput): Promise<Record<string, unknown>>;
    };
}

export const RANKWRANGLER_MCP_STATUS: RankWranglerMcpStatus = {
    service: 'rankwrangler',
    status: 'ready',
    capabilities: {
        product: ['get', 'getMany', 'search', 'history'],
        keyword: ['get', 'search', 'results'],
    },
};
