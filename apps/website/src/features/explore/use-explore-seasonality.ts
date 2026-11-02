import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/trpc';
import type { ExploreFilters } from './explore-filters';
import { exploreFacetsInput } from './explore-search-input';

/**
 * The searched keyword's weekly sales strength by year
 * (`product.searchSeasonality`), for the same set the grid shows. Only a
 * keyword search reads it; history barely moves, so a read stays fresh for an
 * hour. While new filters load, the previous season stays on screen.
 */
export const useExploreSeasonality = (filters: ExploreFilters) => {
    const { brand, listing, niche, nicheState, price, published, q, tiers } = filters;
    const input = useMemo(
        () => exploreFacetsInput({ brand, listing, niche, nicheState, price, published, q, tiers }),
        [brand, listing, niche, nicheState, price, published, q, tiers]
    );
    const query = api.api.app.product.searchSeasonality.useQuery(input, {
        enabled: q.trim() !== '',
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: 3_600_000,
    });
    return { isLoading: query.isLoading, season: query.data ?? null };
};
