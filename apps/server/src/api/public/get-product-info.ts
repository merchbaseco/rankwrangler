import { z } from 'zod';
import { publicApiProcedure } from '@/api/trpc.js';
import { fetchProductInfo } from '@/utils/product-info.js';

const getProductInfoInput = z.object({
    marketplaceId: z.string().min(1, 'Marketplace ID is required'),
    asin: z
        .string()
        .min(1, 'ASIN is required')
        .regex(/^[A-Z0-9]{10}$/i, 'ASIN must be 10 alphanumeric characters')
        .transform(value => value.toUpperCase()),
});

export const getProductInfo = publicApiProcedure
    .input(getProductInfoInput)
    .mutation(async ({ input, ctx }) => {
        const uid = ctx.user?.email ?? ctx.user?.sub ?? 'unknown';
        return fetchProductInfo({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            uid,
            endpoint: 'api.public.getProductInfo',
        });
    });
