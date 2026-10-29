import { keywordFacetsInput, parseKeywordFilters } from '@/features/keywords/keyword-filters';
import { api } from '@/lib/trpc';

/** The Keywords page's opening read (graduated keywords), so both share one cache entry. */
const graduated = keywordFacetsInput(parseKeywordFilters(new URLSearchParams()));

/**
 * Keywords at a glance: every keyword by stage (one grouped count) and the graduated keywords'
 * freshness and checks in the last day (the Keywords page's own facet read).
 */
export const useKeywordOverview = () => {
    const stages = api.api.app.keywordDirectoryCounts.useQuery(
        { heat: 'all' },
        { refetchInterval: 60_000, refetchOnWindowFocus: false }
    );
    const facets = api.api.app.keyword.directoryFacets.useQuery(graduated, {
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
    });
    return { facets: facets.data ?? null, stages: stages.data ?? null };
};
