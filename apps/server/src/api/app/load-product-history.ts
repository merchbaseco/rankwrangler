import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { loadKeepaProductHistory } from '@/services/keepa.js';

const loadProductHistoryInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
    days: z.coerce.number().int().min(30).max(3650).default(365),
});

export const loadProductHistory = appProcedure
    .input(loadProductHistoryInput)
    .mutation(async ({ input }) => {
        return loadKeepaProductHistory({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            days: input.days,
        });
    });
