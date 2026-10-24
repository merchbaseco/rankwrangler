import type { SortingState } from '@tanstack/react-table';
import { useDeferredValue, useMemo } from 'react';
import { api } from '@/lib/trpc';
import { hydrateProducts } from './filter-utils';
import { buildSearchInput } from './search-input';
import type { FilterState } from './types';

export const useProductSearch = ({ activeFacetKeys, filters, searchValue, sorting }: {
    activeFacetKeys: string[];
    filters: FilterState;
    searchValue: string;
    sorting: SortingState;
}) => {
    const deferredSearchValue = useDeferredValue(searchValue);
    const deferredFilters = useDeferredValue(filters);
    const input = useMemo(() => buildSearchInput({
        activeFacetKeys,
        filters: deferredFilters,
        searchValue: deferredSearchValue,
        sorting,
        now: Date.now(),
    }), [activeFacetKeys, deferredFilters, deferredSearchValue, sorting]);
    const query = api.api.app.product.search.useInfiniteQuery(input, {
        getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    });
    const metadata = api.api.app.product.searchMetadata.useQuery();
    const products = useMemo(() => hydrateProducts(
        query.data?.pages.flatMap(page => page.items.map(item => ({
            ...item,
            rootCategoryBsr: item.salesRank,
            dateFirstAvailable: item.firstAvailableAt,
        }))) ?? [],
    ), [query.data]);

    return { ...query, products, metadata: metadata.data };
};
