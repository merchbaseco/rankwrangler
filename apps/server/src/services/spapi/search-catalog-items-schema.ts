import { z } from 'zod';
import type { MerchListingEvidence } from '@/services/merch-listing-classification';
import { toPackageProfile } from '@/services/merch-package-profiles';

export const VariantSchema = z.enum([
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

const ItemDisplayGroupSalesRankSchema = z.object({
    websiteDisplayGroup: z.string().optional(),
    title: z.string(),
    link: z.string().optional(),
    rank: z.number(),
});

const ItemSalesRanksByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    displayGroupRanks: z.array(ItemDisplayGroupSalesRankSchema).optional(),
});

const AttributeValueEntrySchema = z.object({
    value: z.string(),
    marketplace_id: z.string(),
});

const MarketplaceTextEntrySchema = z.object({
    value: z.string(),
    marketplace_id: z.string().optional(),
});

const MarketplaceEntrySchema = z.object({ marketplace_id: z.string().optional() });

const MeasureSchema = z.object({ value: z.number(), unit: z.string() });

// Package measurements only feed the Merch package profile; an odd value must not fail the item.
const PackageDimensionsEntrySchema = z
    .object({
        length: MeasureSchema,
        width: MeasureSchema,
        height: MeasureSchema,
        marketplace_id: z.string().optional(),
    })
    .nullable()
    .catch(null);

const PackageWeightEntrySchema = MeasureSchema.extend({ marketplace_id: z.string().optional() })
    .nullable()
    .catch(null);

const ItemAttributesSchema = z.object({
    product_site_launch_date: z.array(AttributeValueEntrySchema).optional(),
    bullet_point: z.array(MarketplaceTextEntrySchema).optional(),
    product_description: z.array(MarketplaceEntrySchema).optional(),
    externally_assigned_product_identifier: z.array(MarketplaceEntrySchema).optional(),
    item_package_dimensions: z.array(PackageDimensionsEntrySchema).optional(),
    item_package_weight: z.array(PackageWeightEntrySchema).optional(),
});

const ItemImageSchema = z.object({
    variant: VariantSchema,
    link: z.string(),
    height: z.number().optional(),
    width: z.number().optional(),
});

const ItemImagesByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    images: z.array(ItemImageSchema),
});

const ItemSummariesByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    itemName: z.string().optional(),
    brand: z.string().optional(),
    brandName: z.string().optional(),
    itemClassification: z.string().optional(),
});

const ItemIdentifiersByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    identifiers: z.array(z.unknown()),
});

const ItemRelationshipsByMarketplaceSchema = z.object({
    marketplaceId: z.string(),
    relationships: z.array(
        z.object({
            type: z.string(),
            parentAsins: z.array(z.string()).optional(),
            childAsins: z.array(z.string()).optional(),
        })
    ),
});

export const ItemSchema = z.object({
    asin: z.string(),
    identifiers: z.array(ItemIdentifiersByMarketplaceSchema).optional(),
    relationships: z.array(ItemRelationshipsByMarketplaceSchema).optional(),
    attributes: ItemAttributesSchema.optional(),
    salesRanks: z.array(ItemSalesRanksByMarketplaceSchema).optional(),
    images: z.array(ItemImagesByMarketplaceSchema).optional(),
    summaries: z.array(ItemSummariesByMarketplaceSchema).optional(),
});

export const ItemSearchResultsSchema = z.object({
    items: z.array(ItemSchema),
    pagination: z
        .object({ nextToken: z.string().optional(), previousToken: z.string().optional() })
        .optional(),
});

export type CatalogItem = z.infer<typeof ItemSchema>;

/** What a catalog item shows about its listing: Merch evidence plus what the parent fallback reads. */
export const readCatalogListingEvidence = (item: CatalogItem, marketplaceId: string) => {
    const attributes = item.attributes;
    const family = readVariationFamily(item, marketplaceId);
    const summary = item.summaries?.find(entry => entry.marketplaceId === marketplaceId);
    const identifiers = item.identifiers?.find(entry => entry.marketplaceId === marketplaceId);
    const merch: MerchListingEvidence = {
        bullets: inMarketplace(attributes?.bullet_point, marketplaceId).map(entry => entry.value),
        hasProductIdentifier:
            (identifiers?.identifiers.length ?? 0) > 0 ||
            inMarketplace(attributes?.externally_assigned_product_identifier, marketplaceId)
                .length > 0,
        packageProfile: readPackageProfile(attributes, marketplaceId),
    };
    return {
        merch,
        isVariationParent:
            summary?.itemClassification === 'VARIATION_PARENT' || family.childAsin !== null,
        hasProductDescription:
            inMarketplace(attributes?.product_description, marketplaceId).length > 0,
        firstChildAsin: family.childAsin,
    };
};

// A variant names its parent; a parent lists its variants. Either way the family shares one rank.
export const readVariationFamily = (
    item: Pick<CatalogItem, 'asin' | 'relationships'>,
    marketplaceId: string
) => {
    const variations = (
        item.relationships?.find(entry => entry.marketplaceId === marketplaceId)?.relationships ??
        []
    ).filter(relationship => relationship.type === 'VARIATION');
    const parentAsin = variations.flatMap(relationship => relationship.parentAsins ?? [])[0];
    const childAsin = variations.flatMap(relationship => relationship.childAsins ?? [])[0];
    return {
        parentAsin: parentAsin && parentAsin !== item.asin ? parentAsin.toUpperCase() : null,
        childAsin: childAsin ? childAsin.toUpperCase() : null,
    };
};

const readPackageProfile = (attributes: CatalogItem['attributes'], marketplaceId: string) => {
    const [dimensions] = inMarketplace(attributes?.item_package_dimensions, marketplaceId);
    const [weight] = inMarketplace(attributes?.item_package_weight, marketplaceId);
    return dimensions && weight
        ? toPackageProfile({
              dimensions: [dimensions.length, dimensions.width, dimensions.height],
              weight,
          })
        : null;
};

const inMarketplace = <Entry extends { marketplace_id?: string }>(
    entries: readonly (Entry | null)[] | undefined,
    marketplaceId: string
) =>
    (entries ?? []).filter(
        (entry): entry is Entry =>
            entry !== null && (!entry.marketplace_id || entry.marketplace_id === marketplaceId)
    );
