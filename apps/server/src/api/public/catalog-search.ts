import { TRPCError } from '@trpc/server';
import { catalogSearchInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import {
    CatalogSearchBillingError,
    requestCatalogSearch,
} from '@/services/catalog-search';

export const catalogSearch = publicApiProcedure
    .input(catalogSearchInput)
    .mutation(async ({ input, ctx }) => {
        const licenseId = ctx.license?.data?.id;
        if (!licenseId) {
            throw new TRPCError({
                code: 'UNAUTHORIZED',
                message: 'Valid license key required',
            });
        }

        try {
            return (
                await requestCatalogSearch({
                    ...input,
                    licenseId,
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
                        : 'UNAUTHORIZED',
                message: error.message,
                cause: error,
            });
        }
    });
