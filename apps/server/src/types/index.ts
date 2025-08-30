export type SimplifiedCatalogItem = {
    asin: string;
    title: string;
    brand: string;
    bulletPoints: string[];
    thumbnailUrl: string;
    bsr: number | null;
};

export type CatalogSearchResponse = {
    items?: any[];
    pagination?: {
        nextToken?: string;
    };
};

export type SearchCatalogRequest = {
    keywords: string[];
};

export type SearchCatalogApiResponse = {
    success: boolean;
    data?: SimplifiedCatalogItem[];
    error?: string;
};

export type ProductInfo = {
    asin: string;
    marketplaceId: string;
    creationDate: string | null;
    bsr: number | null;
    metadata: {
        lastFetched: string; // ISO timestamp when data was fetched from SP-API
        cached: boolean;     // true if served from cache, false if fresh from SP-API
    };
};

export type ProductInfoRequest = {
    marketplaceId: string;
    asin: string;
};

export type ProductInfoApiResponse = {
    success: boolean;
    data?: ProductInfo;
    error?: string;
};

export type GetCatalogItemResponse = {
    asin?: string;
    summaries?: Array<{
        releaseDate?: string;
        [key: string]: any;
    }>;
    salesRanks?: Array<{
        displayGroupRanks?: Array<{
            websiteDisplayGroup?: string;
            rank?: number;
            [key: string]: any;
        }>;
        [key: string]: any;
    }>;
    [key: string]: any;
};