import type { KeywordDirectoryFacetsInput } from '@/api/keyword-directory-input';
import type { ProductSearchFacetsInput } from '@/api/product-search-input';
import { runBackground } from '@/db/index';
import { readKeywordDirectoryFacets } from '@/db/keyword-directory-facets';
import { readProductSearchFacets } from '@/db/product-search-facets';
import { createSwrCache } from '@/utils/swr-cache';

/**
 * Explore's sidebar counts and KPI bands; one aggregate scan per filter. Fresh for a minute, then
 * served at once for up to half an hour while a background read replaces it.
 */
const productFacets = createSwrCache<Awaited<ReturnType<typeof readProductSearchFacets>>>({
    freshMs: 60_000,
    staleMs: 30 * 60_000,
    maxEntries: 200,
    runRefresh: runBackground,
});

/**
 * The Keywords sidebar counts and KPI band. Directory status moves with live work, so a value is
 * fresh for fifteen seconds; for ten minutes after that it is served at once while a background
 * read replaces it, and the next read (realtime events invalidate the client) sees the new counts.
 */
const keywordFacets = createSwrCache<Awaited<ReturnType<typeof readKeywordDirectoryFacets>>>({
    freshMs: 15_000,
    staleMs: 10 * 60_000,
    maxEntries: 100,
    runRefresh: runBackground,
});

export const readCachedProductSearchFacets = (input: ProductSearchFacetsInput) =>
    productFacets(JSON.stringify(input), () => readProductSearchFacets(input));

export const readCachedKeywordDirectoryFacets = (input: KeywordDirectoryFacetsInput) =>
    keywordFacets(JSON.stringify(input), () => readKeywordDirectoryFacets(input));
