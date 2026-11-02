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
    bsrAxis,
    bsrBucketTip,
    improvingTip,
    publishedAxis,
    publishedDayTip,
    soldAxis,
    soldBucketTip,
} from './explore-band-tips';
import { clearedExploreFilters, type ExploreFilters } from './explore-filters';
import type { ExploreRow } from './explore-rows';
import type { ExploreFacets } from './use-explore-facets';

/**
 * Explore's KPI header (Grid J/K): five cells over their column groups, each
 * a figure over a dot band, all from `product.searchFacets` for the current
 * filters except where noted. The first cell (over #, Design, Niche) holds the
 * active filters as removable tags; BSR distribution (over BSR, 30d) is the tier-
 * coloured log histogram with its median; Rising (over 7d) is the share of
 * results whose rank improved in seven days, drawn as a filled meter; Sold/mo
 * (over Sold/mo) is the median over the monthly-sold histogram; Published per
 * day (over Drops, Age, Price) is the 60-day daily count with its average.
 * Every band names its two ends underneath and every title explains its cell
 * on hover, so the scales read without probing the dots. The search keyword
 * is not a tag here: KeywordHeader names it, and Clear keeps it.
 * While the facets for new filters load, the previous ones stay on screen
 * marked busy, so the header never passes them off as the grid's.
 */
export const ExploreKpis = ({
    facets,
    filters,
    isStale,
    onChange,
}: {
    facets: ExploreFacets | null;
    filters: ExploreFilters;
    /** `facets` describe the previous filters while the current ones load. */
    isStale: boolean;
    onChange: (patch: Partial<ExploreFilters>) => void;
}) => {
    const histogram = facets?.bsrHistogram ?? [];
    const bsrLevels = useMemo(() => bandLevels(histogram.map(bucket => bucket.count)), [histogram]);
    const bsrKeys = useMemo(() => histogram.map(bucket => bucket.tier), [histogram]);
    const daily = facets?.publishedPerDay60d ?? [];
    const dailyLevels = useMemo(() => bandLevels(daily.map(day => day.count)), [daily]);
    const improving = facets?.improving7dShare ?? null;
    const improvingLevels = useMemo(() => bandMeter(improving), [improving]);
    const sold = facets?.soldHistogram ?? [];
    const soldLevels = useMemo(() => bandLevels(sold.map(bucket => bucket.count)), [sold]);
    return (
        <KPIGroup aria-busy={isStale} className="grid-kpis grid-kpis--explore">
            <ActiveFiltersCell
                actions={<GridFiltersButton />}
                filters={exploreActiveFilters(filters)}
                onClear={() => onChange({ ...clearedExploreFilters, q: filters.q })}
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
                        axis={bsrAxis(histogram) ?? undefined}
                        height={bandHeight}
                        keyClass={key => tierClassName(key as ExploreRow['tier'])}
                        keys={bsrKeys}
                        label="BSR distribution of results, coloured by tier"
                        tooltip={index => bsrBucketTip(histogram, index)}
                        values={bsrLevels}
                    />
                }
                dot="tier-hot"
                figure={<KpiFigure format="rank" value={facets?.medianBsr ?? null} />}
                hint="Where the results rank in their category now. Each column counts designs in a BSR range, best (#1) on the left, coloured by tier. The figure is the median rank.
"                span="bsr"
                suffix="median"
                title="BSR distribution"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        axis={['0%', '100%']}
                        height={bandHeight}
                        ink="accent"
                        tooltip={() => improvingTip(improving)}
                        values={improvingLevels}
                    />
                }
                dot="band-ink-accent"
                figure={<KpiFigure format="percent" value={improving} />}
                hint="Share of results whose BSR is better today than 7 days ago, from a sample of up to 2,000 with rank history. The band fills to that share."
                span="d7"
                suffix="7d"
                title="Rising"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        axis={soldAxis(sold) ?? undefined}
                        height={bandHeight}
                        ink="steady"
                        label="Monthly sold distribution of results"
                        tooltip={index => soldBucketTip(sold, index)}
                        values={soldLevels}
                    />
                }
                dot="band-ink-steady"
                figure={<KpiFigure value={facets?.medianSoldPerMonth ?? null} />}
                hint="Amazon’s “bought in past month” badge, on the results that show one. Each column counts designs at a badge step, under 100 on the left to 50K+ on the right. The figure is the median badge.
"                span="sold"
                suffix="median"
                title="Sold/mo"
            />
            <GridKpi
                band={
                    <DotMatrixBand
                        axis={publishedAxis(daily) ?? undefined}
                        height={bandHeight}
                        ink="elite"
                        label="Designs published per day over 60 days"
                        tooltip={index => publishedDayTip(daily, index)}
                        values={dailyLevels}
                    />
                }
                dot="band-ink-elite"
                figure={<KpiFigure format="average" value={facets?.publishedPerDayAvg ?? null} />}
                hint="Results first available on each of the last 60 days, oldest on the left. Only designs RankWrangler tracks count, so this is the keyword’s Merch catalog, not all of Amazon. The figure is the daily average.
"                span="published"
                suffix="60-day avg"
                title="Published per day"
            />
        </KPIGroup>
    );
};

/** Dot height that leaves the band's axis line room in the shared band row. */
const bandHeight = 44;

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
