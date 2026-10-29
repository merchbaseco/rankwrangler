import { productSearchFacetsInput } from '@/api/product-search-input';
import { appProcedure } from '@/api/trpc';
import { readProductSearchFacets } from '@/db/product-search-facets';
import { createTtlCache } from '@/utils/ttl-cache';

/** Explore's sidebar counts and KPI bands; one aggregate scan, memoized per filter for a minute. */
const cached = createTtlCache<Awaited<ReturnType<typeof readProductSearchFacets>>>({
    ttlMs: 60_000,
    maxEntries: 200,
});

export const productSearchFacets = appProcedure
    .input(productSearchFacetsInput)
    .query(({ input }) => cached(JSON.stringify(input), () => readProductSearchFacets(input)));
