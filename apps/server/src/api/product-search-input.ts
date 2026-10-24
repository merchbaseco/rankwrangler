import { z } from 'zod';

const numericRange = z
    .object({
        min: z.number().int().min(0).max(2_147_483_647).optional(),
        max: z.number().int().min(0).max(2_147_483_647).optional(),
    })
    .refine(range => range.min === undefined || range.max === undefined || range.min <= range.max, {
        message: 'Range minimum must not exceed maximum.',
    });
const searchDate = z.union([z.iso.date(), z.iso.datetime()]);
const dateRange = z
    .object({ after: searchDate.optional(), before: searchDate.optional() })
    .refine(
        range => !(range.after && range.before) || new Date(range.after) <= new Date(range.before),
        {
            message: 'Date range must be in chronological order.',
        }
    );

export const productSearchInput = z.object({
    term: z.string().trim().min(1).max(200).optional(),
    textFields: z.enum(['all', 'title']).default('all'),
    excludeWords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    marketplaceIds: z.array(z.string().trim().min(1).max(30)).max(20).default(['ATVPDKIKX0DER']),
    isMerchListing: z.union([z.boolean(), z.enum(['unknown', 'all'])]).default(true),
    amazonListingStatus: z.enum(['active', 'deleted', 'all']).default('active'),
    brands: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    excludeBrands: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    includeOfficialBrands: z.boolean().default(false),
    categoryIds: z.array(z.number().int().positive()).max(50).default([]),
    salesRank: numericRange.optional(),
    price: numericRange.optional(),
    monthlySold: numericRange.optional(),
    firstAvailableAt: dateRange.optional(),
    discoveredAt: dateRange.optional(),
    updatedAt: dateRange.optional(),
    facets: z
        .array(z.object({ facet: z.string().min(1).max(60), name: z.string().min(1).max(200) }))
        .max(20)
        .default([]),
    sort: z
        .enum([
            'relevance',
            'salesRankAsc',
            'salesRankDesc',
            'firstAvailableAtDesc',
            'firstAvailableAtAsc',
            'updatedAtAsc',
            'updatedAtDesc',
            'discoveredAtDesc',
            'priceAsc',
            'priceDesc',
            'monthlySoldDesc',
        ])
        .default('relevance'),
    cursor: z.string().min(1).max(4000).nullish(),
    limit: z.number().int().min(1).max(100).default(50),
});

export type ProductSearchInput = z.infer<typeof productSearchInput>;
