import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type RouterOutputs } from '@/lib/trpc';
import type { ExploreFilters } from './explore-filters';
import { exploreFacetsInput } from './explore-search-input';

export type ExploreFacets = RouterOutputs['api']['app']['product']['searchFacets'];

/**
 * The sidebar counts and KPI aggregates for the current filters
 * (`product.searchFacets`; each group counted without its own filter). Paging
 * and sort do not change it, so turning a page never refetches it.
 */
export const useExploreFacets = (filters: ExploreFilters) => {
    const { brand, listing, niche, nicheState, price, published, q, tiers } = filters;
    // Only the narrowing fields key the read; paging and sort are not facet inputs.
    const input = useMemo(
        () => exploreFacetsInput({ brand, listing, niche, nicheState, price, published, q, tiers }),
        [brand, listing, niche, nicheState, price, published, q, tiers]
    );
    const query = api.api.app.product.searchFacets.useQuery(input, {
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    return { facets: query.data ?? null, isLoading: query.isLoading };
};
