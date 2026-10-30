import { keywordDirectoryFacetsInput } from '@/api/keyword-directory-input';
import { appProcedure } from '@/api/trpc';
import { runBackground } from '@/db/index';
import { readKeywordDirectoryFacets } from '@/db/keyword-directory-facets';
import { createSwrCache } from '@/utils/swr-cache';

/**
 * The Keywords sidebar counts and KPI band. Directory status moves with live work, so a value is
 * fresh for fifteen seconds; for ten minutes after that it is served at once while a background
 * read replaces it, and the next read (realtime events invalidate the client) sees the new counts.
 */
const cached = createSwrCache<Awaited<ReturnType<typeof readKeywordDirectoryFacets>>>({
    freshMs: 15_000,
    staleMs: 10 * 60_000,
    maxEntries: 100,
    runRefresh: runBackground,
});

export const keywordDirectoryFacets = appProcedure
    .input(keywordDirectoryFacetsInput)
    .query(({ input }) => cached(JSON.stringify(input), () => readKeywordDirectoryFacets(input)));
