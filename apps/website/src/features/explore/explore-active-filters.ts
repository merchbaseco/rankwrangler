import { bsrTierDefinitions, bsrTiers } from '@/features/bsr/bsr-tier';
import type { ActiveFilter } from '@/features/grid/active-filters';
import { nicheValueLabel, parseNicheFacetKey } from '@/features/niche/niche-facet';
import {
    type ExploreFilters,
    listingTypeLabels,
    priceBandLabels,
    publishedWindowLabels,
} from './explore-filters';

/**
 * The narrowing filters in force on Explore as removable tags, in sidebar
 * order: the search, listing type (when not Merch), tiers, published window,
 * niche state and niche, brand, price. Sort and paging are not filters.
 */
export const exploreActiveFilters = (filters: ExploreFilters): ActiveFilter[] => {
    const niche = filters.niche ? parseNicheFacetKey(filters.niche) : null;
    return [
        filters.q.trim() ? { id: 'q', label: `“${filters.q.trim()}”` } : null,
        filters.listing === 'merch'
            ? null
            : { id: 'listing', label: listingTypeLabels[filters.listing] },
        ...bsrTiers
            .filter(tier => filters.tiers.has(tier))
            .map(tier => ({ id: `tier:${tier}`, label: bsrTierDefinitions[tier].label })),
        filters.published === 'any'
            ? null
            : { id: 'published', label: publishedWindowLabels[filters.published] },
        filters.nicheState === 'any'
            ? null
            : {
                  id: 'nicheState',
                  label: filters.nicheState === 'has' ? 'Has a niche' : 'No niche',
              },
        niche ? { id: 'niche', label: nicheValueLabel(niche.name) } : null,
        filters.brand ? { id: 'brand', label: `Brand: ${filters.brand}` } : null,
        filters.price === 'any' ? null : { id: 'price', label: priceBandLabels[filters.price] },
    ].filter((filter): filter is ActiveFilter => filter !== null);
};

/** The patch that removes the given tags from the filters. */
export const withoutExploreFilters = (
    filters: ExploreFilters,
    ids: readonly string[]
): Partial<ExploreFilters> => {
    const patch: { -readonly [K in keyof ExploreFilters]?: ExploreFilters[K] } = {};
    const tiers = new Set(filters.tiers);
    for (const id of ids) {
        const tier = bsrTiers.find(candidate => `tier:${candidate}` === id);
        if (tier) {
            tiers.delete(tier);
            patch.tiers = tiers;
        } else if (id === 'q') {
            patch.q = '';
        } else if (id === 'listing') {
            patch.listing = 'merch';
        } else if (id === 'published') {
            patch.published = 'any';
        } else if (id === 'nicheState') {
            patch.nicheState = 'any';
        } else if (id === 'niche') {
            patch.niche = null;
        } else if (id === 'brand') {
            patch.brand = null;
        } else if (id === 'price') {
            patch.price = 'any';
        }
    }
    return patch;
};
