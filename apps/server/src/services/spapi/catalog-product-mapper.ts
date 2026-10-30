import type { z } from 'zod';
import { classifyMerchListing } from '@/services/merch-listing-classification';
import type { SpApiProduct } from '@/types';
import { getRootCategoryId } from '@/types/amazon-root-categories';
import {
    getMarketplaceMerchListingEvidence,
    type ItemSchema,
    VariantSchema,
} from './search-catalog-items-schema';

export const mapSpApiCatalogItem = (
    item: z.infer<typeof ItemSchema>,
    marketplaceId: string,
    fetchedAt: string
): SpApiProduct => {
    const asin = item.asin;
    // Get product site launch date from attributes
    const productSiteLaunchDate = item.attributes?.product_site_launch_date?.find(
        entry => entry.marketplace_id === marketplaceId
    );
    const dateFirstAvailable = productSiteLaunchDate?.value
        ? new Date(productSiteLaunchDate.value).toISOString().split('T')[0]
        : null;
    const merchClassification = classifyMerchListing(
        getMarketplaceMerchListingEvidence(item.attributes, marketplaceId)
    );

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
    const thumbnailUrl = mainImage?.link ?? null;

    // Extract title and brand from summaries
    const summary = item.summaries?.find(s => s.marketplaceId === marketplaceId);
    const title = summary?.itemName || null;
    const brand = summary?.brand || summary?.brandName || null;

    const productInfo: SpApiProduct = {
        asin,
        ...readVariationFamily(item, marketplaceId),
        marketplaceId,
        dateFirstAvailable,
        title,
        brand,
        isMerchListing: merchClassification?.isMerchListing ?? null,
        bullet1: merchClassification?.bullet1 ?? null,
        bullet2: merchClassification?.bullet2 ?? null,
        rootCategoryId,
        rootCategoryBsr,
        thumbnailUrl,
        keepa: null,
        fetchedAt,
    };
    return productInfo;
};

// A variant names its parent; a parent lists its variants. Either way the family shares one rank.
export const readVariationFamily = (
    item: Pick<z.infer<typeof ItemSchema>, 'asin' | 'relationships'>,
    marketplaceId: string
) => {
    const variations = (
        item.relationships?.find(entry => entry.marketplaceId === marketplaceId)?.relationships ?? []
    ).filter(relationship => relationship.type === 'VARIATION');
    const parentAsin = variations.flatMap(relationship => relationship.parentAsins ?? [])[0];
    const childAsin = variations.flatMap(relationship => relationship.childAsins ?? [])[0];
    return {
        parentAsin: parentAsin && parentAsin !== item.asin ? parentAsin.toUpperCase() : null,
        childAsin: childAsin ? childAsin.toUpperCase() : null,
    };
};
