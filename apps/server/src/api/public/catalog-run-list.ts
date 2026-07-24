import { TRPCError } from '@trpc/server';
import { catalogRunListInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import { listCatalogSearchRuns } from '@/db/catalog-search-history';

export const catalogRunList = publicApiProcedure
    .input(catalogRunListInput)
    .query(async ({ input }) => {
        const runs = await listCatalogSearchRuns(input);
        if (!runs) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Catalog query or run cursor not found',
            });
        }
        return runs;
    });
