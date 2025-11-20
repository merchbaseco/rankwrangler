import { z } from 'zod';
import { trackSpApiCall, trackSpApiError } from '@/services/posthog.js';
import { getRootCategoryId } from '@/types/amazon-root-categories.js';
import type { ProductInfo } from '@/types/index.js';
import { formatZodErrorMessage, formatZodValidationErrors } from '@/utils/zod.js';
import { catalogApi, spApiRateLimiter } from './index.js';

// Return type for searchCatalogItemsByAsins (omits rootCategoryDisplayName which is derived from rootCategoryId)
type SearchCatalogItemsResult = Omit<ProductInfo, 'rootCategoryDisplayName'>;

// Get product info using searchCatalogItems API (supports single or multiple ASINs)
export const searchCatalogItemsByAsins = async (
    marketplaceId: string,
    asins: string[],
    caller: string
): Promise<SearchCatalogItemsResult[]> => {
    if (!marketplaceId || typeof marketplaceId !== 'string') {
        throw new Error('Marketplace ID is required');
    }

    if (asins.length === 0) {
        throw new Error('ASINs are required');
    }

    // Always track SP-API call
    trackSpApiCall({
        caller,
        apiName: 'searchCatalogItems',
    });

    let rawResponse: any;
    try {
        rawResponse = await spApiRateLimiter.schedule(() =>
            catalogApi.searchCatalogItems([marketplaceId], {
                identifiers: asins,
                identifiersType: 'ASIN',
                includedData: ['summaries', 'salesRanks', 'attributes', 'images'],
                pageSize: 20,
            })
        );
    } catch (error) {
        trackSpApiError({
            caller,
            apiName: 'searchCatalogItems',
            errorType: 'api_request_failed',
            errorMessage: 'API request failed',
            marketplaceId,
            asins,
        });
        throw error;
    }

    // Validate response and parse items
    const results: SearchCatalogItemsResult[] = [];
    try {
        // Validate response with Zod schema
        const response = ItemSearchResultsSchema.parse(rawResponse);
        const items = response.items;

        for (const rawItem of items) {
            // Validate each item with Zod schema
            const item = ItemSchema.parse(rawItem);
            const asin = item.asin;

            if (!asins.includes(asin)) {
                continue;
            }

            // Get product site launch date from attributes
            const productSiteLaunchDate = item.attributes?.product_site_launch_date?.find(
                entry => entry.marketplace_id === marketplaceId
            );
            const dateFirstAvailable = productSiteLaunchDate?.value
                ? new Date(productSiteLaunchDate.value).toISOString().split('T')[0]
                : null;

            // Extract root category ID and BSR from display group rank (only one display group per item)
            const salesRank = item.salesRanks?.find(sr => sr.marketplaceId === marketplaceId);
            const displayGroupRank = salesRank?.displayGroupRanks?.[0];

            let rootCategoryId: number | null = null;
            let rootCategoryBsr: number | null = null;

            if (displayGroupRank?.rank && displayGroupRank?.title) {
                const categoryId = getRootCategoryId(displayGroupRank.title);
                if (categoryId !== undefined) {
                    rootCategoryId = categoryId;
                    rootCategoryBsr = displayGroupRank.rank;
                }
            }

            // Extract thumbnail URL from images (get MAIN variant or first image)
            const imageGroup = item.images?.find(img => img.marketplaceId === marketplaceId);
            const mainImage =
                imageGroup?.images?.find(img => img.variant === VariantSchema.enum.MAIN) ??
                imageGroup?.images?.[0];
            const thumbnailUrl = mainImage?.link;

            const productInfo: SearchCatalogItemsResult = {
                asin,
                marketplaceId,
                dateFirstAvailable,
                rootCategoryId,
                rootCategoryBsr,
                thumbnailUrl,
                metadata: {
                    lastFetched: new Date().toISOString(),
                    cached: false,
                },
            };

            results.push(productInfo);
        }
    } catch (error) {
        const zodError = error instanceof z.ZodError ? error : null;
        trackSpApiError({
            caller,
            apiName: 'searchCatalogItems',
            errorType: 'validation_failed',
            errorMessage: zodError ? formatZodErrorMessage(zodError) : 'Validation failed',
            marketplaceId,
            asins,
            additionalProperties: zodError
                ? { validationErrors: formatZodValidationErrors(zodError) }
                : undefined,
        });
        throw error;
    }

    const orderedResults = asins
        .map(asin => results.find(item => item.asin === asin))
        .filter((item): item is SearchCatalogItemsResult => Boolean(item));

    return orderedResults ?? [];
};

// ==========================================
// Zod Schemas - Only fields we actually use
// ==========================================

// Image variant enum (used to find MAIN image)
const VariantSchema = z.enum([
    'MAIN',
    'PT01',
    'PT02',
    'PT03',
    'PT04',
    'PT05',
    'PT06',
    'PT07',
    'PT08',
    'SWCH',
]);

// Display group sales rank (used for BSR extraction)
const ItemDisplayGroupSalesRankSchema = z.object({
    websiteDisplayGroup: z.string(),
    title: z.string(),
    link: z.string().optional(),
    rank: z.number(),
});

// Sales ranks by marketplace (contains displayGroupRanks - only one display group per item)
const ItemSalesRanksByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    displayGroupRanks: z
        .array(ItemDisplayGroupSalesRankSchema)
        .max(1, 'Expected at most one display group rank')
        .optional(),
});

// Attribute value entry (used for product_site_launch_date)
const AttributeValueEntrySchema = z.object({
    value: z.string(),
    marketplace_id: z.string(),
});

// Attributes (contains product_site_launch_date)
const ItemAttributesSchema = z.object({
    product_site_launch_date: z.array(AttributeValueEntrySchema).optional(),
});

// Image schema (variant and link are used)
const ItemImageSchema = z.object({
    variant: VariantSchema,
    link: z.string(),
    height: z.number().optional(),
    width: z.number().optional(),
});

// Images by marketplace
const ItemImagesByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    images: z.array(ItemImageSchema),
});

// Item schema (only fields we extract)
const ItemSchema = z.object({
    asin: z.string(),
    attributes: ItemAttributesSchema.optional(),
    salesRanks: z.array(ItemSalesRanksByMarketplaceSchema).optional(),
    images: z.array(ItemImagesByMarketplaceSchema).optional(),
});

// Response schema (only items array is used)
const ItemSearchResultsSchema = z.object({
    items: z.array(ItemSchema),
});
