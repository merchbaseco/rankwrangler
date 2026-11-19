import type { z } from 'zod';
import type { keywordListInput } from '@/api/public/keyword-input';
import type { ProductSearchInput } from '@/api/product-search-input';
import type { ProductGetInclude } from '@/api/public/product-input';
import type { ContactSheet } from './contact-sheet';

export type ProductHistoryMetric = 'salesRank' | 'price';
export type ProductHistoryBucket = 'auto' | 'day' | 'week' | 'month';

export interface ProductGetMcpInput {
    marketplaceId: string;
    asin: string;
    include?: ProductGetInclude[];
}

export interface ProductGetManyMcpInput {
    products: { marketplaceId: string; asin: string }[];
}

export type ProductSearchMcpInput = ProductSearchInput;

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

export type KeywordListMcpInput = z.input<typeof keywordListInput>;

export interface RankWranglerMcpStatus {
    [key: string]: unknown;
    service: 'rankwrangler';
    status: 'ready';
    capabilities: {
        product: ['get', 'getMany', 'search', 'history'];
        keyword: ['get', 'list'];
    };
}

export interface RankWranglerMcpDataSource {
    status(): Promise<RankWranglerMcpStatus>;
    product: {
        get(input: ProductGetMcpInput): Promise<Record<string, unknown>>;
        getMany(input: ProductGetManyMcpInput): Promise<Record<string, unknown>>;
        search(input: ProductSearchMcpInput): Promise<Record<string, unknown>>;
        history(input: ProductHistoryMcpInput): Promise<Record<string, unknown>>;
        /** A contact sheet of these images in order; null when none can be built. */
        contactSheet(imageUrls: ReadonlyArray<string | null>): Promise<ContactSheet | null>;
    };
    keyword: {
        get(input: KeywordGetMcpInput): Promise<Record<string, unknown>>;
        list(input: KeywordListMcpInput): Promise<Record<string, unknown>>;
    };
}

export const RANKWRANGLER_MCP_STATUS: RankWranglerMcpStatus = {
    service: 'rankwrangler',
    status: 'ready',
    capabilities: {
        product: ['get', 'getMany', 'search', 'history'],
        keyword: ['get', 'list'],
    },
};
