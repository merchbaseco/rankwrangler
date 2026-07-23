export type ProductInfo = {
    asin: string;
    marketplaceId: string;
    dateFirstAvailable: string | null;

    // Product title and brand from SP-API
    title: string | null;
    brand: string | null;
    isMerchListing: boolean;
    bullet1: string | null;
    bullet2: string | null;

    // Root category information from database
    rootCategoryId: number | null;
    rootCategoryBsr: number | null;
    rootCategoryDisplayName: string | null;

    // Thumbnail URL from SP-API
    thumbnailUrl?: string;

    keepa: {
        fetchedAt: string;
        sourceUpdatedAt: string | null;
        firstTrackedAt: string | null;
        rootCategoryId: number | null;
        currentRootCategoryBsr: number | null;
        currentNewPrice: {
            amountMinor: number;
            currencyCode: string;
        } | null;
        monthlySold: number | null;
        averageRootCategoryBsr30: number | null;
        averageRootCategoryBsr90: number | null;
        salesRankDrops: {
            days30: number | null;
            days90: number | null;
            days180: number | null;
            days365: number | null;
        };
    } | null;

    metadata: {
        spApiFetchedAt: string | null; // ISO timestamp when data was fetched from SP-API
        cached: boolean; // true if served from product store, false if fresh from SP-API
    };
};
