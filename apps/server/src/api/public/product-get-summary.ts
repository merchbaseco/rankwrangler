import { publicApiProcedure } from '@/api/trpc.js';
import { getRequiredProduct } from '@/services/product-retrieval';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productSummaryInput } from './product-input.js';

export const productGetSummary = publicApiProcedure
    .input(productSummaryInput)
    .mutation(async ({ input, ctx, signal }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await getRequiredProduct({ ...input, signal });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });
