import { z } from 'zod';
import { trackSpApiCall } from '@/services/posthog.js';
import type { ProductInfo } from '@/types/index.js';
import { catalogApi, spApiRateLimiter } from './index.js';

// Get product info using searchCatalogItems API (supports single or multiple ASINs)
export const searchCatalogItemsByAsins = async (
    marketplaceId: string,
    asins: string[],
    caller: string
): Promise<ProductInfo[]> => {
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

    const rawResponse = await spApiRateLimiter.schedule(() =>
        catalogApi.searchCatalogItems([marketplaceId], {
            identifiers: asins,
            identifiersType: 'ASIN',
            includedData: ['summaries', 'salesRanks', 'attributes', 'images'],
            pageSize: 20,
        })
    );

    // Validate response with Zod schema
    const response = ItemSearchResultsSchema.parse(rawResponse);

    const results: ProductInfo[] = [];
    const foundAsins = new Set<string>();

    const items = response.items;

    for (const rawItem of items) {
        // Validate each item with Zod schema
        const item = ItemSchema.parse(rawItem);
        const asin = item.asin;

        if (!asins.includes(asin)) {
            continue;
        }

        const productInfo = parseProductInfo(item, asin, marketplaceId);
        results.push(productInfo);
        foundAsins.add(asin);
    }

    const orderedResults = asins
        .map(asin => results.find(item => item.asin === asin))
        .filter((item): item is ProductInfo => Boolean(item));

    return orderedResults ?? [];
};

function parseProductInfo(item: Item, asin: string, marketplaceId: string): ProductInfo {
    // Get product site launch date from attributes
    const productSiteLaunchDate = item.attributes?.product_site_launch_date?.find(
        entry => entry.marketplace_id === marketplaceId
    );
    const dateFirstAvailable = productSiteLaunchDate?.value
        ? new Date(productSiteLaunchDate.value).toISOString().split('T')[0]
        : null;

    // Extract display group rankings
    const salesRank = item.salesRanks?.find(sr => sr.marketplaceId === marketplaceId);
    const displayGroupRanks =
        salesRank?.displayGroupRanks
            ?.map(rank => ({
                rank: rank.rank,
                category: rank.title,
                link: rank.link,
            }))
            .filter(rank => rank.rank && rank.category) ?? [];

    // Sort by rank (lowest/best first)
    displayGroupRanks.sort((a, b) => a.rank - b.rank);

    // Determine primary BSR (first display group rank)
    const bsr = displayGroupRanks[0]?.rank ?? null;
    const bsrCategory = displayGroupRanks[0]?.category ?? null;

    // Extract thumbnail URL from images (get MAIN variant or first image)
    const imageGroup = item.images?.find(img => img.marketplaceId === marketplaceId);
    const mainImage =
        imageGroup?.images?.find(img => img.variant === VariantSchema.enum.MAIN) ??
        imageGroup?.images?.[0];
    const thumbnailUrl = mainImage?.link;

    return {
        asin,
        marketplaceId,
        dateFirstAvailable,
        bsr,
        bsrCategory,
        displayGroupRanks,
        thumbnailUrl,
        metadata: {
            lastFetched: new Date().toISOString(),
            cached: false,
        },
    };
}

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

// Sales ranks by marketplace (contains displayGroupRanks)
const ItemSalesRanksByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    displayGroupRanks: z.array(ItemDisplayGroupSalesRankSchema).optional(),
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

// Type definitions
type Item = z.infer<typeof ItemSchema>;
