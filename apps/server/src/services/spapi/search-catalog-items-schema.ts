import { z } from 'zod';
import type { BulletEvidence, MerchListingEvidence } from '@/services/merch-listing-classification';

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

// Model numbers are not always strings in catalog payloads; one odd value must not fail the item.
const ModelNumberEntrySchema = z.object({
    value: z.union([z.string(), z.number()]).transform(String),
    marketplace_id: z.string().optional(),
});

const ItemAttributesSchema = z.object({
    product_site_launch_date: z.array(AttributeValueEntrySchema).optional(),
    bullet_point: z.array(MarketplaceTextEntrySchema).optional(),
    part_number: z.array(MarketplaceTextEntrySchema).optional(),
    model_number: z.array(ModelNumberEntrySchema).optional(),
    item_name: z.array(MarketplaceTextEntrySchema).optional(),
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

type MarketplaceTextEntries = z.infer<typeof MarketplaceTextEntrySchema>[] | undefined;

export const getMarketplaceMerchListingEvidence = (
    attributes: z.infer<typeof ItemAttributesSchema> | undefined,
    marketplaceId: string
): MerchListingEvidence => ({
    bullets: getMarketplaceBulletEvidence(attributes?.bullet_point, marketplaceId),
    partNumber: firstMarketplaceValue(attributes?.part_number, marketplaceId),
    modelNumber: firstMarketplaceValue(attributes?.model_number, marketplaceId),
    title: firstMarketplaceValue(attributes?.item_name, marketplaceId),
});

const firstMarketplaceValue = (entries: MarketplaceTextEntries, marketplaceId: string) =>
    filterMarketplaceEntries(entries, marketplaceId)
        .map(entry => entry.value.trim())
        .find(Boolean) ?? null;

const getMarketplaceBulletEvidence = (
    bulletPoints: MarketplaceTextEntries,
    marketplaceId: string
): BulletEvidence => {
    if (!bulletPoints) {
        return { kind: 'unavailable' };
    }

    return {
        kind: 'available',
        bullets: filterMarketplaceEntries(bulletPoints, marketplaceId)
            .map(bulletPoint => bulletPoint.value)
            .filter(Boolean),
    };
};

const filterMarketplaceEntries = (entries: MarketplaceTextEntries, marketplaceId: string) =>
    (entries ?? []).filter(
        entry => !entry.marketplace_id || entry.marketplace_id === marketplaceId
    );
