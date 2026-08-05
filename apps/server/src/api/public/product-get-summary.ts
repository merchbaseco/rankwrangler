import { publicApiProcedure } from '@/api/trpc.js';
import { getRequiredProduct } from '@/services/product-retrieval';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productSummaryInput } from './product-input.js';

export const productGetSummary = publicApiProcedure
    .input(productSummaryInput)
    .mutation(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);

        return await getRequiredProduct({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
        });
    });
