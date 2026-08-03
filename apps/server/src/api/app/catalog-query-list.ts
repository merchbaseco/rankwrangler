import { catalogQueryListInput } from '@/api/catalog-input';
import { appProcedure } from '@/api/trpc';
import { listCatalogQueries } from '@/db/catalog-query-read-model';

export const catalogQueryList = appProcedure
    .input(catalogQueryListInput)
    .query(async ({ input }) => await listCatalogQueries(input));
