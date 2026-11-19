import { productSearchInput } from '@/api/product-search-input';
import { publicApiProcedure } from '@/api/trpc';
import { searchProducts } from '@/services/product-search';
import { consumeServiceAccountUsageForRequest } from './consume-service-account-usage';

export interface ProductSearchProcedureDeps {
    searchProducts: typeof searchProducts;
    consumeServiceAccountUsageForRequest: typeof consumeServiceAccountUsageForRequest;
}
const defaultDeps: ProductSearchProcedureDeps = {
    searchProducts,
    consumeServiceAccountUsageForRequest,
};

export const createProductSearchProcedure = (deps: ProductSearchProcedureDeps = defaultDeps) =>
    publicApiProcedure.input(productSearchInput).query(async ({ input, ctx }) => {
        await deps.consumeServiceAccountUsageForRequest(ctx, 1);
        return await deps.searchProducts(input);
    });

export const productSearch = createProductSearchProcedure();
