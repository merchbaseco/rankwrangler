import { parseNicheFacetKey } from '@/features/niche/niche-facet';
import type { RouterInputs } from '@/lib/trpc';
import {
    type ExploreFilters,
    exploreSortInputs,
    listingTypeInputs,
    priceBandRanges,
} from './explore-filters';

type SearchInput = RouterInputs['api']['app']['product']['search'];
export type FacetsInput = RouterInputs['api']['app']['product']['searchFacets'];

/** The fields that narrow the set (not sort or paging). */
export type ExploreNarrowing = Pick<
    ExploreFilters,
    'brand' | 'listing' | 'niche' | 'nicheState' | 'price' | 'published' | 'q' | 'tiers'
>;

/**
 * The filter half of Explore's server reads, shared by `product.search` and
 * `product.searchFacets` so the grid, its sidebar counts and its KPI cells
 * always describe the same set. Tiers, the published window and has/none
 * niche are server filters (no client-side trimming).
 */
export const exploreFacetsInput = (filters: ExploreNarrowing): FacetsInput => {
    const niche = filters.niche ? parseNicheFacetKey(filters.niche) : null;
    return {
        brands: filters.brand ? [filters.brand] : [],
        facets: niche ? [niche] : [],
        isMerchListing: listingTypeInputs[filters.listing],
        niche: filters.nicheState,
        price: filters.price === 'any' ? undefined : priceBandRanges[filters.price],
        published: filters.published,
        term: filters.q.trim() || undefined,
        tiers: [...filters.tiers],
    };
};

/** One grid page: the shared filters plus sort and offset paging. */
export const exploreSearchInput = (filters: ExploreFilters): SearchInput => ({
    ...exploreFacetsInput(filters),
    page: filters.page,
    pageSize: filters.pageSize,
    // Typing reads only; ⏎ in the search records the phrase (useSubmitSearchInterest).
    recordInterest: false,
    sort: exploreSortInputs[filters.sort],
});
