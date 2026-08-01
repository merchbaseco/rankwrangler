import { publicApiProcedure } from '@/api/trpc.js';
import { getProductHistorySurface } from '@/services/product-history-surface.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productHistoryInput } from './product-input.js';

export const productGetHistory = publicApiProcedure
    .input(productHistoryInput)
    .mutation(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);

        return await getProductHistorySurface({
            ...input,
            format: input.format,
            refresh: 'if_missing',
            ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
        });
    });
