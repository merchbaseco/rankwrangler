import { keywordDirectoryFacetsInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { readKeywordDirectoryFacets } from '@/db/keyword-directory-facets';
import { createTtlCache } from '@/utils/ttl-cache';

/**
 * The Keywords sidebar counts and KPI band. Memoized per filter for fifteen seconds: directory
 * status moves with live work, so the cache only absorbs bursts of identical reads.
 */
const cached = createTtlCache<Awaited<ReturnType<typeof readKeywordDirectoryFacets>>>({
    ttlMs: 15_000,
    maxEntries: 100,
});

export const keywordDirectoryFacets = appProcedure
    .input(keywordDirectoryFacetsInput)
    .query(({ input }) => cached(JSON.stringify(input), () => readKeywordDirectoryFacets(input)));
