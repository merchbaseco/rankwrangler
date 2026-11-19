import type { ProductGetInclude } from '@/api/public/product-input';
import type { SalesCurveParameters } from '@/db/product-search-ranking';
import { MERCH_ROOT_CATEGORY_ID } from '@/db/sales-curve-observations';
import type { ProductHistorySurfaceInput } from '@/services/product-history-surface.js';
import { getProductHistorySurface } from '@/services/product-history-surface.js';
import type { AmazonListingStatus, ProductInfo } from '@/types/index.js';
import { getProductCutoutThumbnail } from './product-cutout-thumbnail';
import { PRODUCT_ENRICHMENT_DEADLINE_MS } from './product-enrichment-wait';
import { getRequiredProduct } from './product-retrieval';
import { estimateMonthlySales, readSalesCurve } from './sales-curve';
import { getProductShortName } from './product-short-name';

const PRODUCT_READ_KEEP_A_MAX_AGE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export type PublicCutoutThumbnail =
    | { status: 'available'; url: string }
    | { status: 'unavailable' };

export interface Product {
    marketplaceId: string;
    asin: string;
    listing: {
        title: string | null;
        shortName: string | null;
        cutoutThumbnail: PublicCutoutThumbnail | null;
        brand: string | null;
        firstAvailableAt: string | null;
        bulletPoints: string[];
        /** Amazon's main product image; null when none is known. */
        imageUrl: string | null;
        isMerchListing: boolean;
        amazonListingStatus: AmazonListingStatus;
    };
    category: { id: number; name: string | null } | null;
    /** The current root-category best sellers rank. */
    salesRank: number | null;
    salesRankAverages: {
        last30Days: number | null;
        last90Days: number | null;
    };
    price: { amountMinor: number; currencyCode: string } | null;
    /** Amazon's bought-in-past-month badge (50, 100, …); null when none was observed. */
    boughtInPastMonth: number | null;
    /** The rank-to-sales curve's order-of-magnitude estimate; null without a rank or a curve. */
    estimatedMonthlySales: number | null;
    salesRankDrops: {
        last30Days: number | null;
        last90Days: number | null;
        last180Days: number | null;
        last365Days: number | null;
    };
}

interface ProductReadInput {
    marketplaceId: string;
    asin: string;
    ownerMerchbaseUserId: string;
    include?: ProductGetInclude[];
    signal?: AbortSignal;
    /** Total wait for requested enrichment; unfinished fields settle as none. */
    enrichmentDeadlineMs?: number;
}

export interface ProductReadModelDeps {
    getRequiredProduct: typeof getRequiredProduct;
    readSalesCurve: typeof readSalesCurve;
    getProductHistorySurface: typeof getProductHistorySurface;
    getProductShortName: typeof getProductShortName;
    getProductCutoutThumbnail: typeof getProductCutoutThumbnail;
}

const defaultDeps: ProductReadModelDeps = {
    getRequiredProduct,
    readSalesCurve,
    getProductHistorySurface,
    getProductShortName,
    getProductCutoutThumbnail,
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
    // One budget covers both enrichment waits, including a regeneration after a source change.
    const enrichmentDeadline =
        Date.now() + (input.enrichmentDeadlineMs ?? PRODUCT_ENRICHMENT_DEADLINE_MS);
    const enrichmentTimeoutMs = () => Math.max(0, enrichmentDeadline - Date.now());
    const shortNamePromise =
        includes.includes('shortName') && initial.isMerchListing === true
            ? deps.getProductShortName({
                  ...identity,
                  title: initial.title,
                  thumbnail: initial.thumbnail,
                  signal: input.signal,
                  timeoutMs: enrichmentTimeoutMs(),
              })
            : Promise.resolve(null);
    const cutoutPromise = includes.includes('cutoutThumbnail')
        ? deps.getProductCutoutThumbnail({
              ...identity,
              thumbnail: initial.thumbnail,
              signal: input.signal,
              timeoutMs: enrichmentTimeoutMs(),
          })
        : Promise.resolve(null);

    const [, initialShortName, initialCutout, { curve }] = await Promise.all([
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
        cutoutPromise,
        deps.readSalesCurve(identity.marketplaceId),
    ]);

    const current = await deps.getRequiredProduct({
        ...identity,
        maxAgeMs: PRODUCT_READ_KEEP_A_MAX_AGE_MS,
        signal: input.signal,
    });
    const product = mapProductToPublicProduct(current, includes.includes('marketData'), curve);
    const sourceUnchanged =
        current.thumbnail.status === initial.thumbnail.status &&
        (current.thumbnail.status !== 'available' ||
            (initial.thumbnail.status === 'available' &&
                current.thumbnail.url === initial.thumbnail.url));
    let shortName: string | null = null;
    if (includes.includes('shortName') && current.isMerchListing === true) {
        shortName =
            initial.isMerchListing === true && current.title === initial.title && sourceUnchanged
                ? initialShortName
                : await deps.getProductShortName({
                      ...identity,
                      title: current.title,
                      thumbnail: current.thumbnail,
                      signal: input.signal,
                      timeoutMs: enrichmentTimeoutMs(),
                  });
    }
    let cutoutThumbnail: Product['listing']['cutoutThumbnail'] = null;
    if (includes.includes('cutoutThumbnail')) {
        const cutoutUrl = sourceUnchanged
            ? initialCutout
            : await deps.getProductCutoutThumbnail({
                  ...identity,
                  thumbnail: current.thumbnail,
                  signal: input.signal,
                  timeoutMs: enrichmentTimeoutMs(),
              });
        cutoutThumbnail = toPublicCutoutThumbnail(cutoutUrl);
    }
    return {
        ...product,
        listing: {
            ...product.listing,
            shortName,
            cutoutThumbnail,
        },
    };
};

const toPublicCutoutThumbnail = (url: string | null): PublicCutoutThumbnail =>
    url ? { status: 'available', url } : { status: 'unavailable' };

export const mapProductToPublicProduct = (
    product: ProductInfo,
    includeMarketData = true,
    curve: SalesCurveParameters | null = null
): Product => {
    const keepa = includeMarketData ? product.keepa : null;
    const salesRank = includeMarketData
        ? (product.keepa?.currentRootCategoryBsr ?? product.rootCategoryBsr)
        : null;
    const average30 = keepa?.averageRootCategoryBsr30 ?? null;
    return {
        marketplaceId: product.marketplaceId,
        asin: product.asin,
        listing: {
            title: product.title,
            shortName: null,
            cutoutThumbnail: null,
            brand: product.brand,
            firstAvailableAt: product.dateFirstAvailable,
            bulletPoints: [product.bullet1, product.bullet2].filter(
                (bullet): bullet is string => bullet !== null
            ),
            imageUrl: product.thumbnail.status === 'available' ? product.thumbnail.url : null,
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
        salesRank,
        salesRankAverages: {
            last30Days: average30,
            last90Days: keepa?.averageRootCategoryBsr90 ?? null,
        },
        price: keepa?.currentNewPrice ?? null,
        boughtInPastMonth: keepa?.monthlySold ?? null,
        estimatedMonthlySales:
            product.rootCategoryId === MERCH_ROOT_CATEGORY_ID
                ? estimateMonthlySales(curve, salesRank ?? average30)
                : null,
        salesRankDrops: {
            last30Days: keepa?.salesRankDrops.days30 ?? null,
            last90Days: keepa?.salesRankDrops.days90 ?? null,
            last180Days: keepa?.salesRankDrops.days180 ?? null,
            last365Days: keepa?.salesRankDrops.days365 ?? null,
        },
    };
};
