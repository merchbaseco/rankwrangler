import { Input, Label, TextField } from '@heroui/react';
import { useCallback } from 'react';
import { bsrTierDefinitions, bsrTiers, tierClassName } from '@/features/bsr/bsr-tier';
import { FilterChecks, FilterRadios, FilterSelect } from '@/features/grid/filter-controls';
import { useSearchDraft } from '@/features/shell/use-search-draft';
import {
    type ExploreFilters,
    exploreSortLabels,
    exploreSorts,
    listingTypeLabels,
    listingTypes,
    type NicheState,
    priceBandLabels,
    priceBands,
    publishedWindowLabels,
    publishedWindows,
} from './explore-filters';
import type { ExploreFacets } from './use-explore-facets';

/**
 * Explore's filter sidebar (Grid J): Sort, Listing type, Tier, Published,
 * Niche, Brand and Price, every group bound to the URL and counted by `product.searchFacets`
 * under the other groups' filters. A niche picked from a row's menu shows
 * with the other active filters as a tag in the KPI header.
 */
export const ExploreSidebar = ({
    facets,
    filters,
    onChange,
}: {
    facets: ExploreFacets | null;
    filters: ExploreFilters;
    onChange: (patch: Partial<ExploreFilters>) => void;
}) => {
    return (
        <>
            <FilterSelect
                label="Sort by"
                onChange={sort => onChange({ sort })}
                options={exploreSorts.map(value => ({
                    label: exploreSortLabels[value],
                    value,
                }))}
                value={filters.sort}
            />
            <FilterSelect
                label="Listing type"
                onChange={listing => onChange({ listing })}
                options={listingTypes.map(value => ({ label: listingTypeLabels[value], value }))}
                value={filters.listing}
            />
            <FilterChecks
                label="Tier"
                onChange={tiers => onChange({ tiers: new Set(tiers) })}
                options={bsrTiers.map(tier => ({
                    count: facets ? facets.tiers[tier] : null,
                    dot: tierClassName(tier),
                    label: bsrTierDefinitions[tier].label,
                    value: tier,
                }))}
                value={[...filters.tiers]}
            />
            <FilterRadios
                label="Published"
                onChange={published => onChange({ published })}
                options={publishedWindows.map(value => ({
                    count: facets ? facets.published[value] : null,
                    label: publishedWindowLabels[value],
                    value,
                }))}
                value={filters.published}
            />
            <FilterChecks
                label="Niche"
                onChange={values => onChange({ nicheState: nicheStateOf(values) })}
                options={[
                    { count: facets?.niche.has ?? null, label: 'Has a niche', value: 'has' },
                    { count: facets?.niche.none ?? null, label: 'No niche', value: 'none' },
                ]}
                value={nicheValues(filters.nicheState)}
            />
            <BrandFilter onChange={brand => onChange({ brand })} value={filters.brand ?? ''} />
            <FilterSelect
                label="Price"
                onChange={price => onChange({ price })}
                options={priceBands.map(value => ({ label: priceBandLabels[value], value }))}
                value={filters.price}
            />
        </>
    );
};

/** The brand box: typing settles before it narrows the grid (exact brand match on the server). */
const BrandFilter = ({
    onChange,
    value,
}: {
    onChange: (brand: string | null) => void;
    value: string;
}) => {
    const commit = useCallback((next: string) => onChange(next.trim() || null), [onChange]);
    const draft = useSearchDraft(value, commit, 400);
    return (
        <TextField
            fullWidth
            onChange={draft.onChange}
            onFocusChange={draft.onFocusChange}
            value={draft.draft}
        >
            <Label>Brand</Label>
            <Input placeholder="Filter brands" />
        </TextField>
    );
};

const nicheValues = (state: NicheState): ('has' | 'none')[] => {
    switch (state) {
        case 'has':
            return ['has'];
        case 'none':
            return ['none'];
        case 'any':
            return [];
        default:
            return state satisfies never;
    }
};

/** Neither or both boxes mean any niche state. */
const nicheStateOf = (values: readonly string[]): NicheState => {
    const has = values.includes('has');
    const none = values.includes('none');
    if (has === none) {
        return 'any';
    }
    return has ? 'has' : 'none';
};
