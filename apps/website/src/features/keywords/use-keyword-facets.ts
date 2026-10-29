import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type RouterOutputs } from '@/lib/trpc';
import { type KeywordFilters, keywordFacetsInput } from './keyword-filters';

export type KeywordFacets = RouterOutputs['api']['app']['keyword']['directoryFacets'];

/**
 * The Keywords sidebar counts and KPI figures for the current filters
 * (`keyword.directoryFacets`). Paging and sort never change it; realtime
 * directory events invalidate it (useKeywordDirectoryChanged).
 */
export const useKeywordFacets = (filters: KeywordFilters) => {
    const { facet, freshness, heat, merch, q, shelf, stage } = filters;
    const input = useMemo(
        () => keywordFacetsInput({ facet, freshness, heat, merch, q, shelf, stage }),
        [facet, freshness, heat, merch, q, shelf, stage]
    );
    const query = api.api.app.keyword.directoryFacets.useQuery(input, {
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
    });
    return query.data ?? null;
};
