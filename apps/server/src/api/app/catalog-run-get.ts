import { TRPCError } from '@trpc/server';
import { appProcedure } from '@/api/trpc';
import { catalogRunGetInput } from '@/api/catalog-input';
import { getCatalogSearchRun } from '@/db/catalog-search';

export const catalogRunGet = appProcedure
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
