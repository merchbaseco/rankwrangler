import { z } from 'zod';
import { productFacetKeys } from '@/services/product-facet-taxonomy';

export const keywordStages = ['graduated', 'trial', 'dropped', 'untracked'] as const;
export const keywordFreshness = ['live', 'needsSync', 'syncing'] as const;
const workKey = z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.string().uuid(),
]);
export const keywordDirectoryCursor = z.object({
    key: workKey,
    asOf: z.string().datetime(),
    sort: z.enum(['work', 'newest']),
});
export const keywordDirectoryFilters = z.object({
    search: z.string().trim().max(200).optional(),
    heat: z.enum(['all', 'hot', 'warm', 'cold', 'unrated']).default('all'),
});
export const keywordDirectoryInput = keywordDirectoryFilters.extend({
    sort: z.enum(['work', 'newest']).default('work'),
    stage: z.enum(['all', ...keywordStages]).default('graduated'),
    freshness: z.enum(['all', ...keywordFreshness]).default('all'),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: keywordDirectoryCursor.optional(),
});

/**
 * The dashboard directory adds research sorts and a dominant-facet filter. The public keyword
 * surface keeps the base input above.
 */
export const appKeywordDirectorySorts = [
    'work',
    'newest',
    'score',
    'medianBsr',
    'fresh',
    'merch',
] as const;
const appKeywordDirectoryCursor = keywordDirectoryCursor.extend({
    sort: z.enum(appKeywordDirectorySorts),
});
export const keywordDirectoryHeats = ['hot', 'warm', 'cold'] as const;

/**
 * The Keywords sidebar. `heat`, `stage` and `freshness` are unions (empty means any).
 * `shelfElite` asks whether the top-ten Merch shelf holds an Elite-tier Product (BSR ≤ 2,500);
 * `merch` whether the keyword has any retained active Merch Product.
 */
const appKeywordDirectoryFilters = {
    heat: z.array(z.enum(keywordDirectoryHeats)).max(keywordDirectoryHeats.length).default([]),
    stage: z.array(z.enum(keywordStages)).max(keywordStages.length).default([]),
    freshness: z.array(z.enum(keywordFreshness)).max(keywordFreshness.length).default([]),
    shelfElite: z.enum(['has', 'none']).optional(),
    merch: z.enum(['tracked', 'none']).optional(),
    facet: z.enum(productFacetKeys).optional(),
};
/** `page` (1-based) switches to offset paging and ignores `cursor`; `pageSize` overrides `limit`. */
export const appKeywordDirectoryInput = keywordDirectoryInput.extend({
    sort: z.enum(appKeywordDirectorySorts).default('work'),
    cursor: appKeywordDirectoryCursor.optional(),
    ...appKeywordDirectoryFilters,
    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
});
export type AppKeywordDirectoryInput = z.infer<typeof appKeywordDirectoryInput>;

export const keywordDirectoryFacetsInput = appKeywordDirectoryInput.pick({
    search: true,
    heat: true,
    stage: true,
    freshness: true,
    shelfElite: true,
    merch: true,
    facet: true,
});
export type KeywordDirectoryFacetsInput = z.infer<typeof keywordDirectoryFacetsInput>;

type PublicKeywordDirectoryInput = z.infer<typeof keywordDirectoryInput>;
/**
 * What the directory read accepts: the dashboard input, or the public one whose `heat`, `stage`
 * and `freshness` are single values (`all` or one value) and which has no sidebar filters.
 */
export type KeywordDirectoryReadInput = Omit<
    AppKeywordDirectoryInput,
    'heat' | 'stage' | 'freshness' | 'page' | 'pageSize'
> &
    Partial<Pick<AppKeywordDirectoryInput, 'page' | 'pageSize'>> & {
        heat: AppKeywordDirectoryInput['heat'] | PublicKeywordDirectoryInput['heat'];
        stage: AppKeywordDirectoryInput['stage'] | PublicKeywordDirectoryInput['stage'];
        freshness: AppKeywordDirectoryInput['freshness'] | PublicKeywordDirectoryInput['freshness'];
    };

/** The snapshot a loaded directory page was read at; row reads reuse it to keep sort keys stable. */
export const keywordDirectoryView = appKeywordDirectoryCursor.omit({ key: true });
export type KeywordDirectoryView = z.infer<typeof keywordDirectoryView>;
