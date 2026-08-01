import { publicApiProcedure } from '@/api/trpc.js';
import { fetchProductInfo } from '@/utils/product-info.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productSummaryInput } from './product-input.js';

export const productGetSummary = publicApiProcedure
    .input(productSummaryInput)
    .mutation(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);

        return await fetchProductInfo({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
        });
    });
