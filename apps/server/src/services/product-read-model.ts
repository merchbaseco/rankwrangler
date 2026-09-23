import type { ProductGetInclude } from '@/api/public/product-input';
import type { ProductHistorySurfaceInput } from '@/services/product-history-surface.js';
import { getProductHistorySurface } from '@/services/product-history-surface.js';
import type { AmazonListingStatus, ProductInfo } from '@/types/index.js';
import { getRequiredProduct } from './product-retrieval';
import { getProductShortName } from './product-short-name';

const PRODUCT_READ_KEEP_A_MAX_AGE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export interface Product {
    marketplaceId: string;
    asin: string;
    listing: {
        title: string | null;
        shortName: string | null;
        brand: string | null;
        firstAvailableAt: string | null;
        bulletPoints: string[];
        thumbnail: { status: 'available'; url: string } | { status: 'unavailable' };
        isMerchListing: boolean | null;
        amazonListingStatus: AmazonListingStatus;
    };
    category: { id: number; name: string | null } | null;
    salesRank: {
        current: number | null;
        averages: {
            last30Days: number | null;
            last90Days: number | null;
        };
    };
    price: { amountMinor: number; currencyCode: string } | null;
    demand: {
        boughtInPastMonth: number | null;
        salesRankDrops: {
            last30Days: number | null;
            last90Days: number | null;
            last180Days: number | null;
            last365Days: number | null;
        };
    };
}

export interface ProductSearchProduct {
    marketplaceId: string;
    asin: string;
    title: string | null;
    brand: string | null;
    thumbnail: { status: 'available'; url: string } | { status: 'unavailable' };
    isMerchListing: boolean | null;
    amazonListingStatus: AmazonListingStatus;
    category: { id: number; name: string | null } | null;
    salesRank: number | null;
    price: { amountMinor: number; currencyCode: string } | null;
    boughtInPastMonth: number | null;
}

export interface ProductSearch {
    keyword: string;
    searchedAt: string;
    results: Array<{
        organicSearchPlacement: number;
        product: ProductSearchProduct;
    }>;
}

interface ProductReadInput {
    marketplaceId: string;
    asin: string;
    ownerMerchbaseUserId: string;
    include?: ProductGetInclude[];
    signal?: AbortSignal;
}

export interface ProductReadModelDeps {
    getRequiredProduct: typeof getRequiredProduct;
    getProductHistorySurface: typeof getProductHistorySurface;
    getProductShortName: typeof getProductShortName;
}

const defaultDeps: ProductReadModelDeps = {
    getRequiredProduct,
    getProductHistorySurface,
    getProductShortName,
};

export const getProductReadModel = async (
    input: ProductReadInput,
    deps: ProductReadModelDeps = defaultDeps
): Promise<Product> => {
    const identity = {
        marketplaceId: input.marketplaceId,
        asin: input.asin.trim().toUpperCase(),
    };

    const initial = await deps.getRequiredProduct({
        ...identity,
        signal: input.signal,
    });

    const includes = input.include ?? ['marketData'];
    const shortNamePromise =
        includes.includes('shortName') && initial.isMerchListing === true
            ? deps.getProductShortName({
                  ...identity,
                  title: initial.title,
                  thumbnail: initial.thumbnail,
                  signal: input.signal,
              })
            : Promise.resolve(null);

    const [, initialShortName] = await Promise.all([
        includes.includes('marketData')
            ? deps.getProductHistorySurface({
                  ...identity,
                  metrics: ['bsr', 'price'],
                  limit: 1,
                  days: 30,
                  bucket: 'day',
                  format: 'agent',
                  refresh: true,
                  ownerMerchbaseUserId: input.ownerMerchbaseUserId,
                  signal: input.signal,
              } satisfies ProductHistorySurfaceInput)
            : Promise.resolve(null),
        shortNamePromise,
    ]);

    const current = await deps.getRequiredProduct({
        ...identity,
        maxAgeMs: PRODUCT_READ_KEEP_A_MAX_AGE_MS,
        signal: input.signal,
    });
    const product = mapProductToPublicProduct(current, includes.includes('marketData'));
    if (!includes.includes('shortName') || current.isMerchListing !== true) {
        return product;
    }

    const shortName =
        initial.isMerchListing === true &&
        current.title === initial.title &&
        current.thumbnail.status === initial.thumbnail.status &&
        (current.thumbnail.status !== 'available' ||
            (initial.thumbnail.status === 'available' &&
                current.thumbnail.url === initial.thumbnail.url))
            ? initialShortName
            : await deps.getProductShortName({
                  ...identity,
                  title: current.title,
                  thumbnail: current.thumbnail,
                  signal: input.signal,
              });
    return { ...product, listing: { ...product.listing, shortName } };
};

export const mapProductToPublicProduct = (
    product: ProductInfo,
    includeMarketData = true
): Product => ({
    marketplaceId: product.marketplaceId,
    asin: product.asin,
    listing: {
        title: product.title,
        shortName: null,
        brand: product.brand,
        firstAvailableAt: product.dateFirstAvailable,
        bulletPoints: [product.bullet1, product.bullet2].filter(
            (bullet): bullet is string => bullet !== null
        ),
        thumbnail:
            product.thumbnail.status === 'available'
                ? product.thumbnail
                : { status: 'unavailable' },
        isMerchListing: product.isMerchListing,
        amazonListingStatus: product.amazonListingStatus,
    },
    category:
        product.rootCategoryId === null
            ? null
            : {
                  id: product.rootCategoryId,
                  name: product.rootCategoryDisplayName,
              },
    salesRank: {
        current: includeMarketData
            ? (product.keepa?.currentRootCategoryBsr ?? product.rootCategoryBsr)
            : null,
        averages: {
            last30Days: includeMarketData
                ? (product.keepa?.averageRootCategoryBsr30 ?? null)
                : null,
            last90Days: includeMarketData
                ? (product.keepa?.averageRootCategoryBsr90 ?? null)
                : null,
        },
    },
    price: includeMarketData ? (product.keepa?.currentNewPrice ?? null) : null,
    demand: {
        boughtInPastMonth: includeMarketData ? (product.keepa?.monthlySold ?? null) : null,
        salesRankDrops: {
            last30Days: includeMarketData ? (product.keepa?.salesRankDrops.days30 ?? null) : null,
            last90Days: includeMarketData ? (product.keepa?.salesRankDrops.days90 ?? null) : null,
            last180Days: includeMarketData ? (product.keepa?.salesRankDrops.days180 ?? null) : null,
            last365Days: includeMarketData ? (product.keepa?.salesRankDrops.days365 ?? null) : null,
        },
    },
});

export const mapProductToCompactProductSearch = (product: Product): ProductSearchProduct => ({
    marketplaceId: product.marketplaceId,
    asin: product.asin,
    title: product.listing.title,
    brand: product.listing.brand,
    thumbnail: product.listing.thumbnail,
    isMerchListing: product.listing.isMerchListing,
    amazonListingStatus: product.listing.amazonListingStatus,
    category: product.category,
    salesRank: product.salesRank.current,
    price: product.price,
    boughtInPastMonth: product.demand.boughtInPastMonth,
});
