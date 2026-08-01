import { publicApiProcedure } from '@/api/trpc.js';
import { getProductReadModel } from '@/services/product-read-model.js';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productGetInput } from './product-input.js';

export const productGet = publicApiProcedure
    .input(productGetInput)
    .mutation(async ({ input, ctx }) => {
        await consumeServiceAccountUsageForRequest(ctx, 1);

        return await getProductReadModel({
            ...input,
            ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
        });
    });
