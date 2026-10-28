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

const ItemAttributesSchema = z.object({
    product_site_launch_date: z.array(AttributeValueEntrySchema).optional(),
    bullet_point: z.array(MarketplaceTextEntrySchema).optional(),
    part_number: z.array(MarketplaceTextEntrySchema).optional(),
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

export const ItemSchema = z.object({
    asin: z.string(),
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
    partNumber:
        filterMarketplaceEntries(attributes?.part_number, marketplaceId)
            .map(entry => entry.value.trim())
            .find(Boolean) ?? null,
});

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
