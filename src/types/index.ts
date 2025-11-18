export type CatalogSearchResponse = {
    items?: any[];
    pagination?: {
        nextToken?: string;
    };
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
    
    // Thumbnail URL from SP-API
    thumbnailUrl?: string;
    
    metadata: {
        lastFetched: string; // ISO timestamp when data was fetched from SP-API
        cached: boolean;     // true if served from product store, false if fresh from SP-API
    };
};
