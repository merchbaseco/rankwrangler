import { productSearchFacetsInput } from '@/api/product-search-input';
import { appProcedure } from '@/api/trpc';
import { readCachedProductSearchSeasonality } from '@/services/dashboard-aggregates';

export const productSearchSeasonality = appProcedure
    .input(productSearchFacetsInput)
    .query(({ input }) => readCachedProductSearchSeasonality(input));
