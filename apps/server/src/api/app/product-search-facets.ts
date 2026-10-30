import { productSearchFacetsInput } from '@/api/product-search-input';
import { appProcedure } from '@/api/trpc';
import { readProductSearchFacets } from '@/db/product-search-facets';
import { createSwrCache } from '@/utils/swr-cache';

/**
 * Explore's sidebar counts and KPI bands; one aggregate scan per filter. Fresh for a minute, then
 * served at once for up to half an hour while a background read replaces it.
 */
const cached = createSwrCache<Awaited<ReturnType<typeof readProductSearchFacets>>>({
    freshMs: 60_000,
    staleMs: 30 * 60_000,
    maxEntries: 200,
});

export const productSearchFacets = appProcedure
    .input(productSearchFacetsInput)
    .query(({ input }) => cached(JSON.stringify(input), () => readProductSearchFacets(input)));
