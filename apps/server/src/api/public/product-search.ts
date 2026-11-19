import { productSearchInput } from '@/api/product-search-input';
import { publicApiProcedure } from '@/api/trpc';
import { searchProductsCollectingTerm } from '@/services/product-search-collection';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';

export interface ProductSearchProcedureDeps {
    searchProducts: typeof searchProductsCollectingTerm;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}
const defaultDeps: ProductSearchProcedureDeps = {
    searchProducts: searchProductsCollectingTerm,
    consumeServiceAccountUsageForRequest,
};

export const createProductSearchProcedure = (deps: ProductSearchProcedureDeps = defaultDeps) =>
    publicApiProcedure.input(productSearchInput).query(async ({ input, ctx, signal }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);
        return await deps.searchProducts(input, {
            serviceAccountId: ctx.accessPrincipal.id,
            ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
            signal,
        });
    });

export const productSearch = createProductSearchProcedure();
