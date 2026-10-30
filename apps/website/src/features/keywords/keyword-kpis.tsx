import { KPIGroup } from '@heroui-pro/react';
import { type ReactNode, useMemo } from 'react';
import { formatCount } from '@/features/bsr/bsr-format';
import { classifyBsr, rankStrength, tierClassName } from '@/features/bsr/bsr-tier';
import { DotMatrixBand } from '@/features/bsr/dot-matrix-band';
import { bandLevels, bandMeter } from '@/features/bsr/dot-matrix-geometry';
import { ActiveFiltersCell, MixSummary } from '@/features/grid/active-filters';
import { GridKpi, KpiFigure } from '@/features/grid/grid-kpi';
import { GridFiltersButton } from '@/features/grid/grid-screen';
import { MixBar } from '@/features/grid/mix-bar';
import { keywordActiveFilters, withoutKeywordFilters } from './keyword-active-filters';
import { minedTip, queueTip, scoreBucketTip, shelfBsrTip } from './keyword-band-tips';
import { clearedKeywordFilters, type KeywordFilters, keywordHeats } from './keyword-filters';
import { heatDisplay, isRatedHeat } from './keyword-model';
import type { KeywordFacets } from './use-keyword-facets';

/**
 * The Keywords KPI header (Grid I), every figure from
 * `keyword.directoryFacets` for the current filters: the active filters as
 * removable tags (over #, Keyword); Score distribution (over Score, 12 weeks) as the heat-coloured
 * score histogram; Mined 24h (over the shelf) and Needs sync + syncing (over
 * New, Merch, Status) as meters of their share of the set; Shelf BSR (over
 * Median BSR) as its place on the log rank scale, in its tier's ink. The
 * facets carry no daily series, so those bands are shares, not histories.
 */
export const KeywordKpis = ({
    facets,
    filters,
    onChange,
    track,
}: {
    facets: KeywordFacets | null;
    filters: KeywordFilters;
    onChange: (patch: Partial<KeywordFilters>) => void;
    /** The Track button for a searched phrase the directory does not have yet. */
    track: ReactNode;
}) => {
    const histogram = facets?.scoreHistogram ?? [];
    const scoreLevels = useMemo(
        () => bandLevels(histogram.map(bucket => bucket.count)),
        [histogram]
    );
    const scoreKeys = useMemo(() => histogram.map(bucket => bucket.heat), [histogram]);
    const total = facets?.total ?? null;
    const mined = facets?.minedLast24h ?? null;
    const median = facets?.medianShelfBsr ?? null;
    const waiting = facets ? facets.needsSync + facets.syncing : null;
    return (
        <KPIGroup className="grid-kpis grid-kpis--keywords">
            <ActiveFiltersCell
                actions={
                    <>
                        {track}
                        <GridFiltersButton />
                    </>
                }
                filters={keywordActiveFilters(filters)}
                onClear={() => onChange(clearedKeywordFilters)}
                onRemove={ids => onChange(withoutKeywordFilters(filters, ids))}
                mix={
                    // Rendered before the counts load so the band keeps its height.
                    <MixBar
                        label="Heat mix"
                        noun={['keyword', 'keywords']}
                        onToggle={heat =>
                            onChange({
                                heat: filters.heat.includes(heat)
                                    ? filters.heat.filter(entry => entry !== heat)
                                    : keywordHeats.filter(
                                          entry =>
                                              entry === heat || filters.heat.includes(entry)
                                      ),
                            })
                        }
                        parts={keywordHeats.map(heat => ({
                            count: facets?.heat[heat] ?? null,
                            key: heat,
                            label: heatDisplay[heat].label,
                            scope: tierClassName(heatDisplay[heat].tier),
                        }))}
                        selected={new Set(filters.heat)}
                    />
                }
                summary={<MixSummary count={total} label="Heat mix" noun="keywords" />}
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        keyClass={key =>
                            isRatedHeat(key) ? tierClassName(heatDisplay[key].tier) : ''
                        }
                        keys={scoreKeys}
                        label="Score distribution, coloured by heat"
                        tooltip={index => scoreBucketTip(histogram, index)}
                        values={scoreLevels}
                    />
                }
                dot="tier-hot"
                figure={<KpiFigure value={facets?.heat.hot ?? null} />}
                span="scores"
                suffix={facets ? `Hot · ${formatCount(facets.heat.warm)} Warm` : 'Hot'}
                title="Score distribution"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        ink="steady"
                        tooltip={() => minedTip(mined, total)}
                        values={bandMeter(share(mined, total))}
                    />
                }
                dot="band-ink-steady"
                figure={<KpiFigure value={mined} />}
                span="mined"
                title="Mined, 24h"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        ink="tier"
                        scope={tierClassName(classifyBsr(median))}
                        tooltip={() => shelfBsrTip(median)}
                        values={bandMeter(rankStrength(median))}
                    />
                }
                dot={tierClassName(classifyBsr(median))}
                figure={<KpiFigure format="rank" value={median} />}
                span="median"
                suffix="median"
                title="Shelf BSR"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        ink="accent"
                        tooltip={() =>
                            facets
                                ? queueTip({
                                      needsSync: facets.needsSync,
                                      syncing: facets.syncing,
                                      total: facets.total,
                                      trials: facets.stage.trial,
                                  })
                                : null
                        }
                        values={bandMeter(share(waiting, total))}
                    />
                }
                dot="band-ink-accent"
                figure={<KpiFigure value={facets?.needsSync ?? null} />}
                span="queue"
                suffix={facets ? `${formatCount(facets.syncing)} syncing` : undefined}
                title="Needs sync"
            />
        </KPIGroup>
    );
};

const share = (part: number | null, whole: number | null) =>
    part === null || !whole ? null : Math.min(1, part / whole);
