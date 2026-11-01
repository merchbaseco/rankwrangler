import type { MerchListingClassification } from '@/services/merch-listing-classification';
import type { SpApiProduct } from '@/types';
import { getRootCategoryId } from '@/types/amazon-root-categories';
import { type CatalogItem, readVariationFamily, VariantSchema } from './search-catalog-items-schema';

export const mapSpApiCatalogItem = (
    item: CatalogItem,
    marketplaceId: string,
    fetchedAt: string,
    merch: MerchListingClassification
): SpApiProduct => {
    const asin = item.asin;
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
        isMerchListing: merch.isMerchListing,
        bullet1: merch.bullet1,
        bullet2: merch.bullet2,
        rootCategoryId,
        rootCategoryBsr,
        thumbnailUrl,
        keepa: null,
        fetchedAt,
    };
    return productInfo;
};
