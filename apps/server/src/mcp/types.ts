export type ProductHistoryMetric = 'salesRank' | 'price';
export type ProductHistoryBucket = 'auto' | 'day' | 'week' | 'month';

export interface ProductGetMcpInput {
    marketplaceId: string;
    asin: string;
}

export interface ProductGetManyMcpInput {
    products: ProductGetMcpInput[];
}

export interface ProductSearchMcpInput {
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
    marketplaceId: 'ATVPDKIKX0DER';
}

export interface KeywordSearchMcpInput {
    text: string;
    marketplaceId: 'ATVPDKIKX0DER';
    cursor: number;
    limit: number;
}

export interface KeywordHistoryMcpInput {
    keyword: string;
    marketplaceId: 'ATVPDKIKX0DER';
    rangeDays: number;
}

export interface RankWranglerMcpStatus {
    [key: string]: unknown;
    service: 'rankwrangler';
    status: 'ready';
    capabilities: {
        product: ['get', 'getMany', 'search', 'history'];
        keyword: ['get', 'search', 'history'];
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
        get(input: KeywordGetMcpInput): Promise<Record<string, unknown>>;
        search(input: KeywordSearchMcpInput): Promise<Record<string, unknown>>;
        history(input: KeywordHistoryMcpInput): Promise<Record<string, unknown>>;
    };
}

export const RANKWRANGLER_MCP_STATUS: RankWranglerMcpStatus = {
    service: 'rankwrangler',
    status: 'ready',
    capabilities: {
        product: ['get', 'getMany', 'search', 'history'],
        keyword: ['get', 'search', 'history'],
    },
};
