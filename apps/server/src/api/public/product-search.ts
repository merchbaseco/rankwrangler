import { TRPCError } from '@trpc/server';
import { publicCatalogSearchInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import { CatalogSearchBillingError } from '@/services/catalog-search';
import { awaitCatalogSearchRetrieval } from '@/services/catalog-search-retrieval';
import { mapRetrievalError } from '@/services/retrieval-coordinator';

export interface ProductSearchProcedureDeps {
    retrieveProductSearch: typeof awaitCatalogSearchRetrieval;
}

const defaultDeps: ProductSearchProcedureDeps = {
    retrieveProductSearch: awaitCatalogSearchRetrieval,
};

export const createProductSearchProcedure = (deps: ProductSearchProcedureDeps = defaultDeps) =>
    publicApiProcedure.input(publicCatalogSearchInput).mutation(async ({ input, ctx, signal }) => {
        try {
            return await deps.retrieveProductSearch({
                ...input,
                serviceAccountId: ctx.accessPrincipal.id,
                ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
                signal,
            });
        } catch (error) {
            if (error instanceof CatalogSearchBillingError) {
                throw new TRPCError({
                    code:
                        error.reason === 'usageLimitExceeded'
                            ? 'TOO_MANY_REQUESTS'
                            : 'SERVICE_UNAVAILABLE',
                    message: error.message,
                    cause: error,
                });
            }
            throw mapRetrievalError(error);
        }
    });

export const productSearch = createProductSearchProcedure();
