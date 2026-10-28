import type { SortingState } from '@tanstack/react-table';
import type { MerchListingFilter } from '@/components/dashboard/app/config';
import type { RouterInputs } from '@/lib/trpc';
import { LAST_UPDATED_HOURS, type FilterState } from './types';

type SearchInput = RouterInputs['api']['app']['product']['search'];

export const buildSearchInput = ({
    activeFacetKeys,
    filters,
    searchValue,
    sorting,
    now,
}: {
    activeFacetKeys: string[];
    filters: FilterState;
    searchValue: string;
    sorting: SortingState;
    now: number;
}): SearchInput => {
    const selectedSort = sorting[0];
    const sort = selectedSort?.id === 'rootCategoryBsr'
        ? selectedSort.desc ? 'salesRankDesc' : 'salesRankAsc'
        : selectedSort?.id === 'dateFirstAvailable'
            ? selectedSort.desc ? 'firstAvailableAtDesc' : 'firstAvailableAtAsc'
            : selectedSort?.desc === false ? 'updatedAtAsc' : 'updatedAtDesc';

    return {
        term: searchValue.trim() || undefined,
        marketplaceIds: filters.marketplaceIds,
        isMerchListing: MERCH_LISTING_INPUT[filters.merchListing],
        amazonListingStatus: 'all',
        includeOfficialBrands: true,
        salesRank: filters.bsrRange
            ? { min: filters.bsrRange[0], max: filters.bsrRange[1] }
            : undefined,
        updatedAt: filters.lastUpdated === 'all'
            ? undefined
            : { after: new Date(now - LAST_UPDATED_HOURS[filters.lastUpdated] * 3_600_000).toISOString() },
        facets: activeFacetKeys.map(key => {
            const separator = key.indexOf(':');
            return { facet: key.slice(0, separator), name: key.slice(separator + 1) };
        }),
        sort,
        limit: 50,
    };
};

const MERCH_LISTING_INPUT = {
    merch: true,
    notMerch: false,
    unknown: 'unknown',
    all: 'all',
} as const satisfies Record<MerchListingFilter, SearchInput['isMerchListing']>;
