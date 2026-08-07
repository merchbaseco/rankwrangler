import { z } from 'zod';
import type { BulletEvidence } from '@/services/merch-listing-classification';

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

const BulletPointEntrySchema = z.object({
    value: z.string(),
    marketplace_id: z.string().optional(),
});

const ItemAttributesSchema = z.object({
    product_site_launch_date: z.array(AttributeValueEntrySchema).optional(),
    bullet_point: z.array(BulletPointEntrySchema).optional(),
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
});

export const getMarketplaceBulletEvidence = (
    bulletPoints:
        | Array<{
              value: string;
              marketplace_id?: string;
          }>
        | undefined,
    marketplaceId: string
): BulletEvidence => {
    if (!bulletPoints) {
        return { kind: 'unavailable' };
    }

    return {
        kind: 'available',
        bullets: bulletPoints
            .filter(
                bulletPoint =>
                    !bulletPoint.marketplace_id || bulletPoint.marketplace_id === marketplaceId
            )
            .map(bulletPoint => bulletPoint.value)
            .filter(Boolean),
    };
};
