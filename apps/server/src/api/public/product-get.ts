import { publicApiProcedure } from '@/api/trpc.js';
import { getProductReadModel } from '@/services/product-read-model.js';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productGetInput } from './product-input.js';

export interface ProductGetDeps {
    getProductReadModel: typeof getProductReadModel;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: ProductGetDeps = {
    getProductReadModel,
    consumeServiceAccountUsageForRequest,
};

export const createProductGetProcedure = (deps: ProductGetDeps = defaultDeps) =>
    publicApiProcedure.input(productGetInput).mutation(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);

        try {
            return await deps.getProductReadModel({
                ...input,
                signal,
                ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
            });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const productGet = createProductGetProcedure();
