import type { ActiveFilter } from '@/features/grid/active-filters';
import {
    defaultKeywordStages,
    isDefaultStages,
    type KeywordFilters,
    keywordFreshnessLabels,
    keywordStageLabels,
} from './keyword-filters';
import { heatDisplay, keywordFacetFilters } from './keyword-model';

/**
 * The narrowing filters in force on Keywords as removable tags, in sidebar
 * order: the search, heat, stage (when not the default Graduated view),
 * freshness, the Top 10 shelf, Merch results and the niche category from a
 * row's menu. Sort and paging are not filters.
 */
export const keywordActiveFilters = (filters: KeywordFilters): ActiveFilter[] =>
    [
        filters.q.trim() ? { id: 'q', label: `“${filters.q.trim()}”` } : null,
        ...filters.heat.map(heat => ({ id: `heat:${heat}`, label: heatDisplay[heat].label })),
        ...(isDefaultStages(filters.stage)
            ? []
            : filters.stage.length
              ? filters.stage.map(stage => ({
                    id: `stage:${stage}`,
                    label: keywordStageLabels[stage],
                }))
              : [{ id: 'stage:all', label: 'All stages' }]),
        ...filters.freshness.map(freshness => ({
            id: `fresh:${freshness}`,
            label: keywordFreshnessLabels[freshness],
        })),
        filters.shelf === 'any'
            ? null
            : {
                  id: 'shelf',
                  label: filters.shelf === 'has' ? 'Has an Elite seller' : 'No Elite seller',
              },
        filters.merch === 'any'
            ? null
            : {
                  id: 'merch',
                  label: filters.merch === 'tracked' ? 'Merch tracked' : 'No Merch yet',
              },
        filters.facet
            ? {
                  id: 'facet',
                  label:
                      keywordFacetFilters.find(entry => entry.facet === filters.facet)?.label ??
                      filters.facet,
              }
            : null,
    ].filter((filter): filter is ActiveFilter => filter !== null);

/** The patch that removes the given tags from the filters. */
export const withoutKeywordFilters = (
    filters: KeywordFilters,
    ids: readonly string[]
): Partial<KeywordFilters> => {
    const removed = new Set(ids);
    const patch: { -readonly [K in keyof KeywordFilters]?: KeywordFilters[K] } = {};
    if (removed.has('q')) {
        patch.q = '';
    }
    if (filters.heat.some(heat => removed.has(`heat:${heat}`))) {
        patch.heat = filters.heat.filter(heat => !removed.has(`heat:${heat}`));
    }
    if (removed.has('stage:all') || filters.stage.some(stage => removed.has(`stage:${stage}`))) {
        // Removing the last stage tag returns to the opening view rather than widening to all.
        const stages = filters.stage.filter(stage => !removed.has(`stage:${stage}`));
        patch.stage = stages.length && !removed.has('stage:all') ? stages : defaultKeywordStages;
    }
    if (filters.freshness.some(freshness => removed.has(`fresh:${freshness}`))) {
        patch.freshness = filters.freshness.filter(freshness => !removed.has(`fresh:${freshness}`));
    }
    if (removed.has('shelf')) {
        patch.shelf = 'any';
    }
    if (removed.has('merch')) {
        patch.merch = 'any';
    }
    if (removed.has('facet')) {
        patch.facet = null;
    }
    return patch;
};
