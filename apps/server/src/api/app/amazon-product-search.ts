import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import { fetchProductInfo } from '@/utils/product-info.js';

const amazonProductSearchInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
});

export const amazonProductSearch = appProcedure
    .input(amazonProductSearchInput)
    .mutation(async ({ input }) => {
        return fetchProductInfo({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
        });
    });
