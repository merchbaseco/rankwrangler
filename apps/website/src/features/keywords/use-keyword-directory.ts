import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/trpc';
import { type KeywordFilters, keywordDirectoryInput } from './keyword-filters';
import type { RankedKeywordRow } from './keyword-model';
import { useKeywordDirectoryChanged } from './use-keyword-directory-changed';
import { useKeywordDirectoryDueRefresh } from './use-keyword-directory-due-refresh';

/**
 * One page of the keyword directory grid: `keywordDirectory` with offset
 * paging and the sidebar's filters. It never polls; realtime directory events
 * patch the page in place while it is shown, and one timer re-reads it when a
 * row's next check comes due. A cached page (prefetched, or left earlier)
 * missed events while hidden, so it renders at once and re-reads in the
 * background when older than 30 seconds. Rows carry their 1-based place in the
 * whole ordering.
 */
export const useKeywordDirectory = (filters: KeywordFilters) => {
    const input = useMemo(() => keywordDirectoryInput(filters), [filters]);
    useKeywordDirectoryChanged(input);
    const query = api.api.app.keywordDirectory.useQuery(input, {
        // Keep rows on screen while a new filter, sort or page loads instead of flashing empty.
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
    });
    const items = query.data?.items ?? emptyRows;
    useKeywordDirectoryDueRefresh(input, items);
    const offset = (filters.page - 1) * filters.pageSize;
    const rows = useMemo<RankedKeywordRow[]>(
        () => items.map((item, index) => ({ ...item, position: offset + index + 1 })),
        [items, offset]
    );
    return {
        error: query.error,
        isLoading: query.isLoading,
        refetch: query.refetch,
        rows,
        total: query.data?.total ?? null,
    };
};

const emptyRows: never[] = [];
