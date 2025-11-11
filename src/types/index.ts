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

export type ProductRanking = {
    rank: number;
    category: string;
    link?: string;
};

export type ProductInfo = {
    asin: string;
    marketplaceId: string;
    creationDate: string | null;
    
    // Primary BSR for filtering/sorting (display group rank if available)
    bsr: number | null;
    bsrCategory: string | null;
    
    // Detailed rankings matching SP-API structure
    displayGroupRanks: ProductRanking[];
    
    metadata: {
        lastFetched: string; // ISO timestamp when data was fetched from SP-API
        cached: boolean;     // true if served from product store, false if fresh from SP-API
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

export type ProductInfoBulkRequest = {
    marketplaceId: string;
    asins: string[];
};

export type ProductInfoBulkApiResponse = {
    success: boolean;
    data?: ProductInfo[];
    missing?: string[];
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
            title?: string;
            link?: string;
            rank?: number;
            [key: string]: any;
        }>;
        classificationRanks?: Array<{
            classificationId?: string;
            title?: string;
            link?: string;
            rank?: number;
            [key: string]: any;
        }>;
        [key: string]: any;
    }>;
    [key: string]: any;
};
