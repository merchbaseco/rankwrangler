import { isProductFresh } from '@/services/product-freshness-policy';
import { type AmazonRootCategoryId, getDisplayGroupName } from '@/types/amazon-root-categories';
import type { ProductFreshness, ProductInfo } from '@/types/index';

interface StoredProductInfo {
    marketplaceId: string;
    asin: string;
    dateFirstAvailable: Date | null;
    thumbnailUrl: string | null;
    title: string | null;
    brand: string | null;
    isMerchListing: boolean | null;
    isUnavailable: boolean;
    bullet1: string | null;
    bullet2: string | null;
    rootCategoryId: number | null;
    rootCategoryBsr: number | null;
    spApiFetchedAt: Date | null;
    spApiResolvedAt: Date | null;
    keepaFetchedAt: Date | null;
    keepaSourceUpdatedAt: Date | null;
    keepaFirstTrackedAt: Date | null;
    keepaRootCategoryId: number | null;
    keepaCurrentBsr: number | null;
    keepaCurrentNewPrice: number | null;
    keepaMonthlySold: number | null;
    keepaBsrAverage30: number | null;
    keepaBsrAverage90: number | null;
    keepaSalesRankDrops30: number | null;
    keepaSalesRankDrops90: number | null;
    keepaSalesRankDrops180: number | null;
    keepaSalesRankDrops365: number | null;
    createdAt: Date;
}

export const mapStoredProductInfo = (
    product: StoredProductInfo,
    { thumbnailPending }: { thumbnailPending: boolean }
): ProductInfo => {
    const currencyCode = getMarketplaceCurrencyCode(product.marketplaceId);

    return {
        asin: product.asin,
        marketplaceId: product.marketplaceId,
        dateFirstAvailable: product.dateFirstAvailable?.toISOString() ?? null,
        title: product.title,
        brand: product.brand,
        isMerchListing: product.isMerchListing,
        isUnavailable: product.isUnavailable,
        bullet1: product.bullet1,
        bullet2: product.bullet2,
        thumbnail: getProductThumbnail(product, thumbnailPending),
        rootCategoryId: product.rootCategoryId,
        rootCategoryBsr: product.rootCategoryBsr,
        rootCategoryDisplayName:
            product.rootCategoryId === null
                ? null
                : (getDisplayGroupName(product.rootCategoryId as AmazonRootCategoryId) ?? null),
        keepa: product.keepaFetchedAt
            ? {
                  fetchedAt: product.keepaFetchedAt.toISOString(),
                  sourceUpdatedAt: product.keepaSourceUpdatedAt?.toISOString() ?? null,
                  firstTrackedAt: product.keepaFirstTrackedAt?.toISOString() ?? null,
                  rootCategoryId: product.keepaRootCategoryId,
                  currentRootCategoryBsr: product.keepaCurrentBsr,
                  currentNewPrice:
                      product.keepaCurrentNewPrice !== null && currencyCode
                          ? {
                                amountMinor: product.keepaCurrentNewPrice,
                                currencyCode,
                            }
                          : null,
                  monthlySold: product.keepaMonthlySold,
                  averageRootCategoryBsr30: product.keepaBsrAverage30,
                  averageRootCategoryBsr90: product.keepaBsrAverage90,
                  salesRankDrops: {
                      days30: product.keepaSalesRankDrops30,
                      days90: product.keepaSalesRankDrops90,
                      days180: product.keepaSalesRankDrops180,
                      days365: product.keepaSalesRankDrops365,
                  },
              }
            : null,
        freshness: getProductFreshness(product),
    };
};

const getProductThumbnail = (product: StoredProductInfo, thumbnailPending: boolean) => {
    if (thumbnailPending) {
        return { status: 'pending' as const };
    }
    if (product.thumbnailUrl) {
        return { status: 'available' as const, url: product.thumbnailUrl };
    }
    return { status: 'unavailable' as const };
};

const getProductFreshness = (product: StoredProductInfo): ProductFreshness => {
    const updatedAt = product.spApiFetchedAt?.toISOString() ?? null;
    const stale = !isProductFresh(product.spApiFetchedAt);

    return { stale, updatedAt };
};

const getMarketplaceCurrencyCode = (marketplaceId: string) => {
    const currencies: Record<string, string> = {
        ATVPDKIKX0DER: 'USD',
        A1F83G8C2ARO7P: 'GBP',
        A1PA6795UKMFR9: 'EUR',
        A13V1IB3VIYZZH: 'EUR',
        A1VC38T7YXB528: 'JPY',
        APJ6JRA9NG5V4: 'EUR',
        A2EUQ1WTGCTBG2: 'CAD',
        A1RKKUPIHCS9HS: 'EUR',
        A21TJRUUN4KGV: 'INR',
        A1AM78C64UM0Y8: 'MXN',
        A2Q3Y263D00KWC: 'BRL',
    };

    return currencies[marketplaceId] ?? null;
};
