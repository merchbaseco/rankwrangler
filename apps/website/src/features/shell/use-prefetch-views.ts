import { useEffect } from 'react';
import { parseExploreFilters } from '@/features/explore/explore-filters';
import { exploreFacetsInput, exploreSearchInput } from '@/features/explore/explore-search-input';
import {
    keywordDirectoryInput,
    keywordFacetsInput,
    parseKeywordFilters,
} from '@/features/keywords/keyword-filters';
import { api } from '@/lib/trpc';

const PREFETCH_DELAY_MS = 1_500;
const PREFETCH_STALE_MS = 30_000;

/**
 * Warms the default reads of Explore and Keywords once the opening screen has had its turn, so
 * the first switch to either view renders from cache. Reads already cached or in flight (the
 * current view's own) are left alone.
 */
export const usePrefetchViews = () => {
    const utils = api.useUtils();
    useEffect(() => {
        const timer = setTimeout(() => {
            const explore = parseExploreFilters(new URLSearchParams());
            const keywords = parseKeywordFilters(new URLSearchParams());
            const options = { staleTime: PREFETCH_STALE_MS };
            // Prefetch failures are not the user's concern; the view reads again when shown.
            Promise.allSettled([
                utils.api.app.product.search.prefetch(exploreSearchInput(explore), options),
                utils.api.app.product.searchFacets.prefetch(exploreFacetsInput(explore), options),
                utils.api.app.keywordDirectory.prefetch(keywordDirectoryInput(keywords), options),
                utils.api.app.keyword.directoryFacets.prefetch(
                    keywordFacetsInput(keywords),
                    options
                ),
            ]).catch(() => undefined);
        }, PREFETCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [utils]);
};
