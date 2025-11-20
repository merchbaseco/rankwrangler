export type ProductInfo = {
    asin: string;
    marketplaceId: string;
    dateFirstAvailable: string | null;

    // Root category information from database
    rootCategoryId: number | null;
    rootCategoryBsr: number | null;
    rootCategoryDisplayName: string | null;

    // Thumbnail URL from SP-API
    thumbnailUrl?: string;

    metadata: {
        lastFetched: string; // ISO timestamp when data was fetched from SP-API
        cached: boolean; // true if served from product store, false if fresh from SP-API
    };
};
