import { TRPCError } from '@trpc/server';
import { catalogRunGetInput } from '@/api/catalog-input';
import { publicApiProcedure } from '@/api/trpc';
import { getCatalogSearchRun } from '@/db/catalog-search-history';

export const catalogRunGet = publicApiProcedure
    .input(catalogRunGetInput)
    .query(async ({ input }) => {
        const run = await getCatalogSearchRun(input.id);
        if (!run) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Catalog Search run not found',
            });
        }
        return run;
    });
