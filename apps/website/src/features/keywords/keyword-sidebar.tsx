import { tierClassName } from '@/features/bsr/bsr-tier';
import { FilterChecks, FilterSelect } from '@/features/grid/filter-controls';
import {
    type KeywordFilters,
    keywordFreshnesses,
    keywordFreshnessLabels,
    keywordHeats,
    keywordSortLabels,
    keywordSorts,
    keywordStageLabels,
    keywordStages,
} from './keyword-filters';
import { heatDisplay } from './keyword-model';
import type { KeywordFacets } from './use-keyword-facets';

/**
 * The Keywords filter sidebar (Grid I): Sort, Stage, Freshness, Heat, Top 10
 * shelf and Merch results, bound to the URL and counted by
 * `keyword.directoryFacets` under the other groups' filters. Stage opens on
 * Graduated; no stage box means every stage, and Untracked shows only while
 * such keywords exist. The shelf and Merch groups are has/none pairs:
 * neither or both boxes mean any.
 */
export const KeywordSidebar = ({
    facets,
    filters,
    onChange,
}: {
    facets: KeywordFacets | null;
    filters: KeywordFilters;
    onChange: (patch: Partial<KeywordFilters>) => void;
}) => (
    <>
        <FilterSelect
            label="Sort by"
            onChange={sort => onChange({ sort })}
            options={keywordSorts.map(value => ({ label: keywordSortLabels[value], value }))}
            value={filters.sort}
        />
        <FilterChecks
            label="Stage"
            onChange={stage => onChange({ stage })}
            options={keywordStages
                .filter(
                    stage =>
                        stage !== 'untracked' ||
                        Boolean(facets?.stage.untracked) ||
                        filters.stage.includes(stage)
                )
                .map(stage => ({
                    count: facets?.stage[stage] ?? null,
                    label: keywordStageLabels[stage],
                    value: stage,
                }))}
            value={filters.stage}
        />
        <FilterChecks
            label="Freshness"
            onChange={freshness => onChange({ freshness })}
            options={keywordFreshnesses.map(freshness => ({
                count: facets?.freshness[freshness] ?? null,
                label: keywordFreshnessLabels[freshness],
                value: freshness,
            }))}
            value={filters.freshness}
        />
        <FilterChecks
            label="Heat"
            onChange={heat => onChange({ heat })}
            options={keywordHeats.map(heat => ({
                count: facets?.heat[heat] ?? null,
                dot: tierClassName(heatDisplay[heat].tier),
                label: heatDisplay[heat].label,
                value: heat,
            }))}
            value={filters.heat}
        />
        <FilterChecks
            label="Top 10 shelf"
            onChange={values => onChange({ shelf: pairState(values, 'has', 'none') })}
            options={[
                {
                    count: facets?.shelf.hasElite ?? null,
                    label: 'Has an Elite seller',
                    value: 'has',
                },
                {
                    count: facets?.shelf.noElite ?? null,
                    label: 'No Elite seller',
                    value: 'none',
                },
            ]}
            value={filters.shelf === 'any' ? [] : [filters.shelf]}
        />
        <FilterChecks
            label="Merch results"
            onChange={values => onChange({ merch: pairState(values, 'tracked', 'none') })}
            options={[
                {
                    count: facets?.merch.tracked ?? null,
                    label: 'At least one tracked',
                    value: 'tracked',
                },
                { count: facets?.merch.none ?? null, label: 'None tracked yet', value: 'none' },
            ]}
            value={filters.merch === 'any' ? [] : [filters.merch]}
        />
    </>
);

/** A has/none checkbox pair as one state: exactly one box picks it, neither or both mean any. */
const pairState = <A extends string, B extends string>(
    values: readonly string[],
    first: A,
    second: B
): A | B | 'any' => {
    const hasFirst = values.includes(first);
    if (hasFirst === values.includes(second)) {
        return 'any';
    }
    return hasFirst ? first : second;
};
