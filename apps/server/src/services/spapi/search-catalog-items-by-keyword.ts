import { z } from 'zod';
import { trackSpApiCall, trackSpApiError } from '@/services/posthog.js';
import { getRootCategoryId } from '@/types/amazon-root-categories.js';
import { classifyMerchBullets } from '@/utils/merch-bullets.js';
import { formatZodErrorMessage, formatZodValidationErrors } from '@/utils/zod.js';
import { catalogApi, spApiRateLimiter } from './index.js';
import {
    getMarketplaceBulletPoints,
    ItemSchema,
    ItemSearchResultsSchema,
    VariantSchema,
} from './search-catalog-items-schema.js';

const MAX_PAGE_SIZE = 20;
const MIN_PAGE_SIZE = 1;
const KEYWORD_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const KEYWORD_SEARCH_CACHE_MAX_ENTRIES = 250;

export type CatalogKeywordSearchItem = {
    asin: string;
    marketplaceId: string;
    dateFirstAvailable: string | null;
    title: string | null;
    brand: string | null;
    bullet1: string | null;
    bullet2: string | null;
    isMerchListing: boolean;
    rootCategoryBsr: number | null;
    thumbnailUrl: string | null;
    facets: Array<{ facet: string; name: string }>;
    lastFetched: string;
};

export type CatalogKeywordSearchResult = {
    items: CatalogKeywordSearchItem[];
    metadata: {
        cached: boolean;
        keyword: string;
        lastFetched: string;
        marketplaceId: string;
    };
};

type CachedKeywordSearchEntry = {
    expiresAtMs: number;
    result: CatalogKeywordSearchResult;
};

const keywordSearchCache = new Map<string, CachedKeywordSearchEntry>();

export const searchCatalogItemsByKeyword = async ({
    marketplaceId,
    keyword,
    pageSize,
    caller,
}: {
    marketplaceId: string;
    keyword: string;
    pageSize: number;
    caller: string;
}): Promise<CatalogKeywordSearchResult> => {
    if (!marketplaceId.trim()) {
        throw new Error('Marketplace ID is required');
    }

    const normalizedKeyword = normalizeKeyword(keyword);
    if (!normalizedKeyword) {
        throw new Error('Keyword is required');
    }

    const clampedPageSize = clampPageSize(pageSize);
    const cacheKey = [marketplaceId, normalizedKeyword, clampedPageSize].join(':');
    const nowMs = Date.now();
    const cached = keywordSearchCache.get(cacheKey);

    if (cached && cached.expiresAtMs > nowMs) {
        return {
            ...cached.result,
            metadata: {
                ...cached.result.metadata,
                cached: true,
            },
        };
    }

    trackSpApiCall({
        caller,
        apiName: 'searchCatalogItemsByKeyword',
    });

    let rawResponse: unknown;
    try {
        rawResponse = await spApiRateLimiter.schedule(() =>
            catalogApi.searchCatalogItems([marketplaceId], {
                keywords: [normalizedKeyword],
                includedData: ['summaries', 'salesRanks', 'attributes', 'images'],
                pageSize: clampedPageSize,
            })
        );
    } catch (error) {
        trackSpApiError({
            caller,
            apiName: 'searchCatalogItemsByKeyword',
            errorType: 'api_request_failed',
            errorMessage: 'API request failed',
            marketplaceId,
            additionalProperties: {
                keyword: normalizedKeyword,
                pageSize: String(clampedPageSize),
            },
        });
        throw error;
    }

    const fetchedAt = new Date().toISOString();

    try {
        const parsed = ItemSearchResultsSchema.parse(rawResponse);
        const items = parsed.items
            .slice(0, clampedPageSize)
            .map((item) => mapCatalogItemFromKeywordSearch(item, marketplaceId, fetchedAt));

        const result: CatalogKeywordSearchResult = {
            items,
            metadata: {
                cached: false,
                keyword: normalizedKeyword,
                lastFetched: fetchedAt,
                marketplaceId,
            },
        };

        setKeywordSearchCache(cacheKey, result, nowMs + KEYWORD_SEARCH_CACHE_TTL_MS);

        return result;
    } catch (error) {
        const zodError = error instanceof z.ZodError ? error : null;
        trackSpApiError({
            caller,
            apiName: 'searchCatalogItemsByKeyword',
            errorType: 'validation_failed',
            errorMessage: zodError ? formatZodErrorMessage(zodError) : 'Validation failed',
            marketplaceId,
            additionalProperties: {
                keyword: normalizedKeyword,
                ...(zodError
                    ? {
                          validationErrors: formatZodValidationErrors(zodError),
                      }
                    : {}),
            },
        });
        throw error;
    }
};

export const mapCatalogItemFromKeywordSearch = (
    item: z.infer<typeof ItemSchema>,
    marketplaceId: string,
    fetchedAt: string
): CatalogKeywordSearchItem => {
    const productSiteLaunchDate = item.attributes?.product_site_launch_date?.find(
        entry => entry.marketplace_id === marketplaceId
    );
    const dateFirstAvailable = productSiteLaunchDate?.value
        ? new Date(productSiteLaunchDate.value).toISOString().split('T')[0]
        : null;

    const bulletPoints = getMarketplaceBulletPoints(item.attributes?.bullet_point, marketplaceId);
    const merchClassification = classifyMerchBullets(bulletPoints);

    const salesRank = item.salesRanks?.find(rank => rank.marketplaceId === marketplaceId);
    const displayGroupRank = salesRank?.displayGroupRanks?.[0];

    let rootCategoryBsr: number | null = null;
    if (displayGroupRank?.rank && displayGroupRank?.title) {
        const categoryId = getRootCategoryId(displayGroupRank.title);
        if (categoryId !== undefined) {
            rootCategoryBsr = displayGroupRank.rank;
        }
    }

    const imageGroup = item.images?.find(image => image.marketplaceId === marketplaceId);
    const mainImage =
        imageGroup?.images?.find(image => image.variant === VariantSchema.enum.MAIN) ??
        imageGroup?.images?.[0];
    const thumbnailUrl = mainImage?.link ?? null;

    const summary = item.summaries?.find(value => value.marketplaceId === marketplaceId);

    return {
        asin: item.asin,
        marketplaceId,
        dateFirstAvailable,
        title: summary?.itemName ?? null,
        brand: summary?.brand ?? summary?.brandName ?? null,
        bullet1: merchClassification.bullet1,
        bullet2: merchClassification.bullet2,
        isMerchListing: merchClassification.isMerchListing,
        rootCategoryBsr,
        thumbnailUrl,
        facets: [],
        lastFetched: fetchedAt,
    };
};

const setKeywordSearchCache = (
    cacheKey: string,
    result: CatalogKeywordSearchResult,
    expiresAtMs: number
) => {
    keywordSearchCache.set(cacheKey, {
        expiresAtMs,
        result,
    });

    if (keywordSearchCache.size <= KEYWORD_SEARCH_CACHE_MAX_ENTRIES) {
        return;
    }

    const oldestKey = keywordSearchCache.keys().next().value;
    if (oldestKey) {
        keywordSearchCache.delete(oldestKey);
    }
};

const normalizeKeyword = (keyword: string) => keyword.trim().replace(/\s+/g, ' ');

const clampPageSize = (value: number) => {
    if (!Number.isFinite(value)) {
        return MAX_PAGE_SIZE;
    }

    return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.floor(value)));
};
