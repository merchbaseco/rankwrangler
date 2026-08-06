import { publicApiProcedure } from '@/api/trpc.js';
import { getProductReadModel } from '@/services/product-read-model.js';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productGetInput } from './product-input.js';

export const productGet = publicApiProcedure
    .input(productGetInput)
    .mutation(async ({ input, ctx, signal }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await getProductReadModel({
                ...input,
                signal,
                ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
            });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });
