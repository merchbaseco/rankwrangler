import { TRPCError } from '@trpc/server';
import { catalogQueryGetInput } from '@/api/catalog-input';
import { appProcedure } from '@/api/trpc';
import { updateCatalogQueryTracking } from '@/services/catalog-query-tracking';

export const catalogQueryUntrack = appProcedure
    .input(catalogQueryGetInput)
    .mutation(async ({ input }) => {
        const query = await updateCatalogQueryTracking({
            term: input.term,
            enabled: false,
        });
        if (!query) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Catalog query not found',
            });
        }
        return query;
    });
