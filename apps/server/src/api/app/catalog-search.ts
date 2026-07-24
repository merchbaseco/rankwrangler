import { appProcedure } from '@/api/trpc';
import { catalogSearchInput } from '@/api/catalog-input';
import { requestCatalogSearch } from '@/services/catalog-search';

export const catalogSearch = appProcedure
    .input(catalogSearchInput)
    .mutation(async ({ input }) => {
        return (await requestCatalogSearch(input)).response;
    });
