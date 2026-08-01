import { TRPCError } from '@trpc/server';
import { catalogSearchInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import { CatalogSearchBillingError, requestCatalogSearch } from '@/services/catalog-search';

export const catalogSearch = publicApiProcedure
    .input(catalogSearchInput)
    .mutation(async ({ input, ctx }) => {
        try {
            return (
                await requestCatalogSearch({
                    ...input,
                    serviceAccountId: ctx.accessPrincipal.id,
                    ownerMerchbaseUserId: ctx.accessPrincipal.merchbaseUserId,
                })
            ).response;
        } catch (error) {
            if (!(error instanceof CatalogSearchBillingError)) {
                throw error;
            }
            throw new TRPCError({
                code:
                    error.reason === 'usageLimitExceeded'
                        ? 'TOO_MANY_REQUESTS'
                        : 'SERVICE_UNAVAILABLE',
                message: error.message,
                cause: error,
            });
        }
    });
