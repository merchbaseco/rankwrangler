import { z } from 'zod';
import { bsrTierKeys } from '@/services/bsr-tiers';

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

/**
 * Explore's sidebar filters, dashboard-only. `tiers` is a union of BSR tiers (a Product with no
 * rank is `slow`); `published` windows `firstAvailableAt` by UTC calendar day (the last 60 or 365
 * days, today included); `niche` asks whether a Product carries any semantic facet.
 */
const productGridFilters = {
    tiers: z.array(z.enum(bsrTierKeys)).max(bsrTierKeys.length).default([]),
    published: z.enum(['last60d', 'lastYear', 'any']).default('any'),
    niche: z.enum(['has', 'none', 'any']).default('any'),
};

/**
 * The dashboard's Product search. `recordInterest: false` reads without tracking the term, so the
 * website's as-you-type search never turns half-typed prefixes into keywords; the website records
 * a phrase only on an explicit submit (keywordTrack). The default keeps the public behaviour.
 * `page` (1-based) switches to offset paging and ignores `cursor`; `pageSize` overrides `limit`.
 */
export const appProductSearchInput = productSearchInput.extend({
    recordInterest: z.boolean().default(true),
    ...productGridFilters,
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
});
export type AppProductSearchInput = z.infer<typeof appProductSearchInput>;

/** Facet counts and KPI aggregates take the search filters without paging, sort or interest. */
export const productSearchFacetsInput = productSearchInput
    .omit({ sort: true, cursor: true, limit: true })
    .extend(productGridFilters);
export type ProductSearchFacetsInput = z.infer<typeof productSearchFacetsInput>;

/** Everything the stored search reads; the public search leaves the dashboard fields unset. */
export type StoredProductSearchInput = ProductSearchInput &
    Partial<Pick<AppProductSearchInput, 'tiers' | 'published' | 'niche' | 'page' | 'pageSize'>>;
/** The filter part shared by search, its total, and facets. */
export type ProductCatalogFilterInput = Omit<StoredProductSearchInput, 'sort' | 'cursor' | 'limit'>;
