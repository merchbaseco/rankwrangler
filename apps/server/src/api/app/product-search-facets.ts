import { productSearchFacetsInput } from '@/api/product-search-input';
import { appProcedure } from '@/api/trpc';
import { readCachedProductSearchFacets } from '@/services/dashboard-aggregates';

export const productSearchFacets = appProcedure
    .input(productSearchFacetsInput)
    .query(({ input }) => readCachedProductSearchFacets(input));
