import { publicApiProcedure } from '@/api/trpc';
import { getBasicProductReadModels } from '@/services/basic-product-read-model';
import { mapRetrievalError } from '@/services/retrieval-coordinator';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productGetManyInput } from './product-input';

export interface ProductGetManyDeps {
    getBasicProductReadModels: typeof getBasicProductReadModels;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: ProductGetManyDeps = {
    getBasicProductReadModels,
    consumeServiceAccountUsageForRequest,
};

export const createProductGetManyProcedure = (deps: ProductGetManyDeps = defaultDeps) =>
    publicApiProcedure.input(productGetManyInput).mutation(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, input.asins.length);

        try {
            return await deps.getBasicProductReadModels({
                products: input.asins.map(asin => ({ marketplaceId: input.marketplaceId, asin })),
                signal,
            });
        } catch (error) {
            throw mapRetrievalError(error);
        }
    });

export const productGetMany = createProductGetManyProcedure();
