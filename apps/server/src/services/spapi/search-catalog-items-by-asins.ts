import { createSpApiClient } from '@/services/spapi/spapi-client.js';
import { getRootCategoryId } from '@/types/amazon-root-categories.js';
import type { ProductInfo } from '@/types/index.js';
import { classifyMerchBullets } from '@/utils/merch-bullets.js';
import {
    getMarketplaceBulletPoints,
    ItemSchema,
    ItemSearchResultsSchema,
    VariantSchema,
} from './search-catalog-items-schema.js';

// Return type for searchCatalogItemsByAsins (omits rootCategoryDisplayName which is derived from rootCategoryId)
type SearchCatalogItemsResult = Omit<ProductInfo, 'rootCategoryDisplayName'>;
const spApiClient = createSpApiClient();

// Get product info using searchCatalogItems API (supports single or multiple ASINs)
export const searchCatalogItemsByAsins = async (
    marketplaceId: string,
    asins: string[]
): Promise<SearchCatalogItemsResult[]> => {
    if (!marketplaceId || typeof marketplaceId !== 'string') {
        throw new Error('Marketplace ID is required');
    }

    if (asins.length === 0) {
        throw new Error('ASINs are required');
    }

    const rawResponse = await spApiClient.searchCatalogItemsByAsins({
        asins,
        marketplaceId,
    });

    // Validate response and parse items
    const results: SearchCatalogItemsResult[] = [];
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
        const bulletPoints = getMarketplaceBulletPoints(
            item.attributes?.bullet_point,
            marketplaceId
        );
        const merchClassification = classifyMerchBullets(bulletPoints);

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

        // Extract title and brand from summaries
        const summary = item.summaries?.find(s => s.marketplaceId === marketplaceId);
        const title = summary?.itemName || null;
        const brand = summary?.brand || summary?.brandName || null;

        const productInfo: SearchCatalogItemsResult = {
            asin,
            marketplaceId,
            dateFirstAvailable,
            title,
            brand,
            isMerchListing: merchClassification.isMerchListing,
            bullet1: merchClassification.bullet1,
            bullet2: merchClassification.bullet2,
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

    const orderedResults = asins
        .map(asin => results.find(item => item.asin === asin))
        .filter((item): item is SearchCatalogItemsResult => Boolean(item));

    return orderedResults ?? [];
};
