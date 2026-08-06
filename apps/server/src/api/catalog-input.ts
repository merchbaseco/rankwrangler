import { z } from 'zod';

export const catalogSearchInput = z.object({
    term: z.string().trim().min(1).max(200),
    maxAgeSeconds: z
        .number()
        .int()
        .min(0)
        .max(7 * 24 * 60 * 60)
        .default(24 * 60 * 60),
});

export const publicCatalogSearchInput = z.object({
    term: z.string().trim().min(1).max(200),
    refresh: z.boolean().default(false),
});

export const catalogRunGetInput = z.object({
    id: z.string().uuid(),
});

export const catalogQueryGetInput = z.object({
    term: z.string().trim().min(1).max(200),
});

export const catalogQueryListInput = z.object({
    search: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).default(100),
});

export const catalogRunListInput = z.object({
    queryId: z.string().uuid(),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().uuid().optional(),
});
