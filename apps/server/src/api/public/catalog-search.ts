import { TRPCError } from '@trpc/server';
import { publicCatalogSearchInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import { CatalogSearchBillingError } from '@/services/catalog-search';
import { awaitCatalogSearchRetrieval } from '@/services/catalog-search-retrieval';
import { mapRetrievalError } from '@/services/retrieval-coordinator';

export interface CatalogSearchProcedureDeps {
    retrieveCatalogSearch: typeof awaitCatalogSearchRetrieval;
}

const defaultDeps: CatalogSearchProcedureDeps = {
    retrieveCatalogSearch: awaitCatalogSearchRetrieval,
};

export const createCatalogSearchProcedure = (deps: CatalogSearchProcedureDeps = defaultDeps) =>
    publicApiProcedure.input(publicCatalogSearchInput).mutation(async ({ input, ctx, signal }) => {
        try {
            return await deps.retrieveCatalogSearch({
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

export const catalogSearch = createCatalogSearchProcedure();
