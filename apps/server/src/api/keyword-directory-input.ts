import { z } from 'zod';

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
