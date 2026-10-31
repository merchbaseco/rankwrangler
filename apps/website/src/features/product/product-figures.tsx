import { KPIGroup } from '@heroui-pro/react';
import { KPI } from '@heroui-pro/react/kpi';
import { useMemo, useState } from 'react';
import { formatCount, formatShortDate } from '@/features/bsr/bsr-format';
import {
    bsrTierDefinitions,
    classifyBsr,
    estimateMonthlySales,
    tierClassName,
} from '@/features/bsr/bsr-tier';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import { trendOf } from '@/features/bsr/trend';
import { GridKpi, KpiFigure } from '@/features/grid/grid-kpi';
import { dailyDrops, dailyRanks, monthlyBest } from './product-bands';
import {
    DropsBand,
    formatMonth,
    KeywordsBand,
    RankDotBand,
    RankHalftoneBand,
} from './product-figure-bands';
import { rankChangeVsAverage } from './product-format';
import type { ProductPageDetail } from './use-product-detail';
import type { ProductKeyword } from './use-product-keywords';

/**
 * The Product page's KPI header (the Grid direction's KPI cells, a figure
 * over its band): rank now in its tier over the 30-day halftone, the 30-day
 * average with the move against it, the 90-day average over its daily ranks,
 * best ever over each month's best, units sold, rank drops over the days they
 * fell on, and keyword reach over one column per keyword. Bands come from the
 * stored rank history; a figure with no series behind it keeps the hatch.
 * Missing figures read as an em dash, and so does every figure until the
 * product loads: the header renders at once at its final size.
 */
export const ProductFigures = ({
    history,
    keywords,
    keywordTotals,
    product,
}: {
    /** The full stored rank history, oldest first. */
    history: readonly RankPoint[];
    keywords: readonly ProductKeyword[];
    keywordTotals: { keywords: number; pageOne: number } | null;
    product: ProductPageDetail | null;
}) => {
    const keepa = product?.keepa;
    const bsr = product?.rootCategoryBsr ?? keepa?.currentRootCategoryBsr ?? null;
    const tier = classifyBsr(bsr);
    const change = rankChangeVsAverage(bsr, keepa?.averageRootCategoryBsr30);
    const reportedSold = keepa?.monthlySold ?? null;
    const best = product?.bestEverBsr ?? null;
    const [now] = useState(() => Date.now());
    const bands = useMemo(
        () => ({
            days30: dailyRanks(history, 30, now),
            days90: dailyRanks(history, 90, now),
            drops: dailyDrops(history, 30, now),
            months: monthlyBest(history),
        }),
        [history, now]
    );
    return (
        <KPIGroup className="grid-kpis grid-kpis--product">
            <GridKpi
                band={
                    bands.days30.length > 1 ? (
                        <RankHalftoneBand days={bands.days30} tier={tier} />
                    ) : undefined
                }
                dot={tierClassName(tier)}
                figure={<KpiFigure format="rankExact" value={bsr} />}
                span="even"
                suffix={product ? bsrTierDefinitions[tier].label : undefined}
                title="BSR"
            />
            <GridKpi
                figure={
                    <KpiFigure format="rankExact" value={keepa?.averageRootCategoryBsr30 ?? null} />
                }
                span="even"
                suffix={
                    change === null ? undefined : (
                        <KPI.Trend trend={trendOf(change)} variant="tertiary">
                            {Math.abs(change)}%
                        </KPI.Trend>
                    )
                }
                title="30d average"
            />
            <GridKpi
                band={
                    bands.days90.length > 1 ? (
                        <RankDotBand
                            label="Daily rank, last 90 days, coloured by tier"
                            points={bands.days90}
                            when={formatShortDate}
                        />
                    ) : undefined
                }
                figure={
                    <KpiFigure format="rankExact" value={keepa?.averageRootCategoryBsr90 ?? null} />
                }
                span="even"
                title="90d average"
            />
            <GridKpi
                band={
                    bands.months.length > 1 ? (
                        <RankDotBand
                            label="Best rank of each month, coloured by tier"
                            points={bands.months}
                            when={formatMonth}
                        />
                    ) : undefined
                }
                figure={<KpiFigure format="rankExact" value={best?.value ?? null} />}
                span="even"
                suffix={best ? formatShortDate(best.at) : undefined}
                title="Best ever"
            />
            <GridKpi
                figure={<KpiFigure value={reportedSold ?? estimateMonthlySales(bsr)} />}
                span="even"
                suffix={product ? (reportedSold === null ? 'estimate' : 'Amazon') : undefined}
                title="Sold/mo"
            />
            <GridKpi
                band={
                    // Drawn only beside Keepa's own count, so the band never shows drops under a zero.
                    (keepa?.salesRankDrops?.days30 ?? 0) > 0 &&
                    bands.drops.some(day => day.drops > 0) ? (
                        <DropsBand days={bands.drops} />
                    ) : undefined
                }
                dot="band-ink-steady"
                figure={<KpiFigure value={keepa?.salesRankDrops?.days30 ?? null} />}
                span="even"
                suffix={product ? `${formatCount(keepa?.salesRankDrops?.days365)} in 1y` : undefined}
                title="Drops 30d"
            />
            <GridKpi
                band={keywords.length > 0 ? <KeywordsBand keywords={keywords} /> : undefined}
                dot="band-ink-accent"
                figure={<KpiFigure value={keywordTotals?.keywords ?? null} />}
                span="even"
                suffix={
                    keywordTotals ? `${formatCount(keywordTotals.pageOne)} on page one` : undefined
                }
                title="Keywords"
            />
        </KPIGroup>
    );
};
