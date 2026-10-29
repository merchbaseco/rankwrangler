import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type RouterOutputs } from '@/lib/trpc';
import type { ExploreFilters } from './explore-filters';
import { exploreSearchInput } from './explore-search-input';

export type ExploreProduct = RouterOutputs['api']['app']['product']['search']['items'][number];

/**
 * One page of the Explore grid: `product.search` with offset paging, so the
 * pager can say "1–50 of N · Page x of y". The previous page stays on screen
 * while the next loads instead of flashing empty.
 */
export const useExploreProducts = (filters: ExploreFilters) => {
    const input = useMemo(() => exploreSearchInput(filters), [filters]);
    const query = api.api.app.product.search.useQuery(input, {
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: 60_000,
    });
    return {
        error: query.error,
        isFetching: query.isFetching,
        isLoading: query.isLoading,
        products: query.data?.items ?? emptyProducts,
        total: query.data?.total ?? null,
        totalIsEstimate: query.data?.totalIsEstimate ?? false,
    };
};

const emptyProducts: readonly ExploreProduct[] = [];
