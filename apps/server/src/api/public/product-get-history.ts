import { publicApiProcedure } from '@/api/trpc.js';
import { getProductHistorySurface } from '@/services/product-history-surface.js';
import { consumeLicenseUsageOrThrow } from './consume-license-usage.js';
import { productHistoryInput } from './product-input.js';

export const productGetHistory = publicApiProcedure
    .input(productHistoryInput)
    .mutation(async ({ input, ctx }) => {
        await consumeLicenseUsageOrThrow(ctx, 1);

        return await getProductHistorySurface({
            ...input,
            format: input.format,
            refresh: 'if_missing',
        });
    });
