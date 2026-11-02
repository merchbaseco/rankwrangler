import { publicApiProcedure } from '@/api/trpc';
import { lookupProductFamilies } from '@/services/product-family-lookup';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';
import { productFamilyInput } from './product-input';

export interface ProductFamilyDeps {
    lookupProductFamilies: typeof lookupProductFamilies;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}

const defaultDeps: ProductFamilyDeps = {
    lookupProductFamilies,
    consumeServiceAccountUsageForRequest,
};

export const createProductFamilyProcedure = (deps: ProductFamilyDeps = defaultDeps) =>
    publicApiProcedure.input(productFamilyInput).mutation(async ({ input, ctx }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, input.asins.length);
        return await deps.lookupProductFamilies(input);
    });

export const productFamily = createProductFamilyProcedure();
