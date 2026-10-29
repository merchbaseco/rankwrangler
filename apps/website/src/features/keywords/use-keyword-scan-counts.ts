import { api } from '@/lib/trpc';
import { keywordFacetsInput, parseKeywordFilters } from './keyword-filters';

/**
 * The directory's default-view queue figures (needing sync, syncing now) for the
 * banner's status pill, read only while `enabled` (on Keywords). It shares the
 * Keywords page's cache entry when that page has no filters set; realtime
 * directory events invalidate it with the rest of the directory reads.
 */
export const useKeywordScanCounts = (enabled: boolean) => {
    const query = api.api.app.keyword.directoryFacets.useQuery(unfiltered, {
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    return enabled && query.data
        ? { needsSync: query.data.needsSync, syncing: query.data.syncing }
        : null;
};

/** The unfiltered facets input, keyed like the page's own read when it has no filters. */
const unfiltered = keywordFacetsInput(parseKeywordFilters(new URLSearchParams()));
