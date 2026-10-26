import { z } from 'zod';

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
    trialTurn: z.boolean(),
    sort: z.enum(['work', 'newest']),
});
export const keywordDirectoryInput = z.object({
    sort: z.enum(['work', 'newest']).default('work'),
    search: z.string().trim().max(200).optional(),
    state: z.enum(['all', 'queued', 'scanning', 'upToDate', 'untracked']).default('all'),
    heat: z.enum(['all', 'hot', 'warm', 'cold', 'unrated']).default('all'),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: keywordDirectoryCursor.optional(),
});
