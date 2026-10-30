import { KPIGroup } from '@heroui-pro/react';
import { useMemo } from 'react';
import { type BsrTier, bsrTierDefinitions, bsrTiers, tierClassName } from '@/features/bsr/bsr-tier';
import { DotMatrixBand } from '@/features/bsr/dot-matrix-band';
import { bandLevels, bandMeter } from '@/features/bsr/dot-matrix-geometry';
import { ActiveFiltersCell, MixSummary } from '@/features/grid/active-filters';
import { GridKpi, KpiFigure } from '@/features/grid/grid-kpi';
import { GridFiltersButton } from '@/features/grid/grid-screen';
import { MixBar } from '@/features/grid/mix-bar';
import { exploreActiveFilters, withoutExploreFilters } from './explore-active-filters';
import {
    bsrBucketTip,
    improvingTip,
    publishedDayTip,
    soldBins,
    soldBinTip,
} from './explore-band-tips';
import { clearedExploreFilters, type ExploreFilters } from './explore-filters';
import type { ExploreRow } from './explore-rows';
import type { ExploreFacets } from './use-explore-facets';

/**
 * Explore's KPI header (Grid J/K): five cells over their column groups, each
 * a figure over a dot band, all from `product.searchFacets` for the current
 * filters except where noted. The first cell (over #, Design, Niche) holds the
 * active filters as removable tags; BSR distribution (over BSR, 30d) is the tier-
 * coloured log histogram with its median; Improving (over 7d) is the share of
 * results whose rank improved in seven days, drawn as a filled meter; Sold/mo
 * (over Sold/mo) is the median, its band the spread across this page (the
 * facets carry no sold histogram); Published per day (over Drops, Age, Price)
 * is the 60-day daily count with its average.
 */
export const ExploreKpis = ({
    facets,
    filters,
    onChange,
    rows,
}: {
    facets: ExploreFacets | null;
    filters: ExploreFilters;
    onChange: (patch: Partial<ExploreFilters>) => void;
    rows: readonly ExploreRow[];
}) => {
    const histogram = facets?.bsrHistogram ?? [];
    const bsrLevels = useMemo(() => bandLevels(histogram.map(bucket => bucket.count)), [histogram]);
    const bsrKeys = useMemo(() => histogram.map(bucket => bucket.tier), [histogram]);
    const daily = facets?.publishedPerDay60d ?? [];
    const dailyLevels = useMemo(() => bandLevels(daily.map(day => day.count)), [daily]);
    const improving = facets?.improving7dShare ?? null;
    const improvingLevels = useMemo(() => bandMeter(improving), [improving]);
    const sold = useMemo(
        () => soldBins(rows.flatMap(row => (row.sold ? [row.sold.value] : []))),
        [rows]
    );
    const soldLevels = useMemo(() => bandLevels(sold.map(bin => bin.count)), [sold]);
    return (
        <KPIGroup className="grid-kpis grid-kpis--explore">
            <ActiveFiltersCell
                actions={<GridFiltersButton />}
                filters={exploreActiveFilters(filters)}
                onClear={() => onChange(clearedExploreFilters)}
                onRemove={ids => onChange(withoutExploreFilters(filters, ids))}
                mix={
                    // Rendered before the counts load so the band keeps its height.
                    <MixBar
                        label="Tier mix"
                        noun={['design', 'designs']}
                        onToggle={tier => onChange({ tiers: toggled(filters.tiers, tier) })}
                        parts={bsrTiers.map(tier => ({
                            count: facets?.tiers[tier] ?? null,
                            key: tier,
                            label: bsrTierDefinitions[tier].label,
                            scope: tierClassName(tier),
                        }))}
                        selected={filters.tiers}
                    />
                }
                summary={
                    <MixSummary count={facets?.total ?? null} label="Tier mix" noun="results" />
                }
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        keyClass={key => tierClassName(key as ExploreRow['tier'])}
                        keys={bsrKeys}
                        label="BSR distribution of results, coloured by tier"
                        tooltip={index => bsrBucketTip(histogram, index)}
                        values={bsrLevels}
                    />
                }
                dot="tier-hot"
                figure={<KpiFigure format="rank" value={facets?.medianBsr ?? null} />}
                span="bsr"
                suffix="median"
                title="BSR distribution"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        ink="accent"
                        tooltip={() => improvingTip(improving)}
                        values={improvingLevels}
                    />
                }
                dot="band-ink-accent"
                figure={<KpiFigure format="percent" value={improving} />}
                span="d7"
                suffix="7d"
                title="Improving"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        ink="steady"
                        label="Sold per month across this page"
                        tooltip={index => soldBinTip(sold, index)}
                        values={soldLevels}
                    />
                }
                dot="band-ink-steady"
                figure={<KpiFigure value={facets?.medianSoldPerMonth ?? null} />}
                span="sold"
                suffix="median"
                title="Sold/mo"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        ink="elite"
                        label="Designs published per day over 60 days"
                        tooltip={index => publishedDayTip(daily, index)}
                        values={dailyLevels}
                    />
                }
                dot="band-ink-elite"
                figure={<KpiFigure format="average" value={facets?.publishedPerDayAvg ?? null} />}
                span="published"
                suffix="60-day avg"
                title="Published per day"
            />
        </KPIGroup>
    );
};

/** A tier set with one tier switched on or off. */
const toggled = (tiers: ReadonlySet<BsrTier>, tier: BsrTier) => {
    const next = new Set(tiers);
    if (next.has(tier)) {
        next.delete(tier);
    } else {
        next.add(tier);
    }
    return next;
};
