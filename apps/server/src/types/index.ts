export type ProductThumbnail =
    | { status: 'pending' }
    | { status: 'available'; url: string }
    | { status: 'unavailable' };

export interface ProductFreshness {
    stale: boolean;
    updatedAt: string | null;
}

export interface ProductInfo {
    asin: string;
    marketplaceId: string;
    dateFirstAvailable: string | null;

    // Product title and brand from SP-API
    title: string | null;
    brand: string | null;
    isMerchListing: boolean | null;
    bullet1: string | null;
    bullet2: string | null;

    // Root category information from database
    rootCategoryId: number | null;
    rootCategoryBsr: number | null;
    rootCategoryDisplayName: string | null;

    thumbnail: ProductThumbnail;

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

    freshness: ProductFreshness;
}

export type SpApiProduct = Omit<
    ProductInfo,
    'rootCategoryDisplayName' | 'thumbnail' | 'freshness'
> & {
    fetchedAt: string;
    thumbnailUrl: string | null;
};
