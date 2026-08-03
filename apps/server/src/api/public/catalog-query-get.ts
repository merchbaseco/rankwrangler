import { TRPCError } from '@trpc/server';
import { catalogQueryGetInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import { getCatalogQuery } from '@/db/catalog-query-read-model';
import { normalizeCatalogDisplayTerm } from '@/services/catalog-search';

export const catalogQueryGet = publicApiProcedure
    .input(catalogQueryGetInput)
    .query(async ({ input }) => {
        const query = await getCatalogQuery(normalizeCatalogDisplayTerm(input.term).toLowerCase());
        if (!query) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Catalog query not found',
            });
        }
        return query;
    });
