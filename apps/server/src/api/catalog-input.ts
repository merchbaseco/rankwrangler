import { z } from 'zod';

export const catalogSearchInput = z.object({
    term: z.string().trim().min(1).max(200),
    maxAgeSeconds: z.number().int().min(0).max(7 * 24 * 60 * 60).default(24 * 60 * 60),
});

export const catalogRunGetInput = z.object({
    id: z.string().uuid(),
});
