import type { BsrTier } from '@/features/bsr/bsr-tier';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import {
    bandPixelHeight,
    formatRankTick,
    formatTimeTick,
    MIN_BAND_LABEL_PX,
    rankDomain,
    rankTicks,
    tierBands,
    timeTicks,
} from './rank-history-axis';

export interface RankChartGeometry {
    /** The exact series, oldest first, as an open path. */
    readonly line: string;
    /** The line closed down to the plot's floor, filled with each band's halftone. */
    readonly area: string;
    /** Each tier's rank span on the plot, best tier first; `label` when it is tall enough. */
    readonly bands: readonly {
        readonly tier: BsrTier;
        readonly y: number;
        readonly height: number;
        readonly label: boolean;
    }[];
    /** Dashed rules at the thresholds between bands. */
    readonly cuts: string;
    /** Hairlines at the rank ticks. */
    readonly grid: string;
    readonly yTicks: readonly { readonly y: number; readonly label: string }[];
    readonly xTicks: readonly { readonly x: number; readonly label: string }[];
    readonly plot: {
        readonly left: number;
        readonly right: number;
        readonly top: number;
        readonly bottom: number;
    };
    /** Each sample's position, for the pointer and the markers. */
    readonly points: readonly { readonly x: number; readonly y: number }[];
    /** The best-ranked sample. */
    readonly best: number;
}

/** Room for the rank labels (left), the tier rail and names (right) and the dates (below). */
export const RANK_CHART_INSET = { bottom: 26, left: 44, right: 68, top: 10 } as const;

const YEAR_SPAN_MS = 400 * 86_400_000;

/**
 * Lays a rank history into a `width × height` drawing: rank on a reversed log
 * axis (a better rank climbs) over the tier bands of its padded domain, time
 * across. Returns null without a ranked sample; one sample draws flat across.
 */
export const rankChartGeometry = (
    series: readonly RankPoint[],
    { height, width }: { height: number; width: number }
): RankChartGeometry | null => {
    const samples = series
        .filter(point => point.salesRank > 0)
        .map(point => ({ rank: point.salesRank, time: Date.parse(point.at) }))
        .filter(point => Number.isFinite(point.time));
    const first = samples[0];
    const last = samples.at(-1);
    if (!(first && last)) {
        return null;
    }
    const domain = rankDomain(samples.map(point => point.rank));
    const plot = {
        bottom: height - RANK_CHART_INSET.bottom,
        left: RANK_CHART_INSET.left,
        right: width - RANK_CHART_INSET.right,
        top: RANK_CHART_INSET.top,
    };
    const plotHeight = plot.bottom - plot.top;
    const logLow = Math.log(domain[0]);
    const logSpan = Math.log(domain[1]) - logLow || 1;
    const y = (rank: number) => plot.top + ((Math.log(rank) - logLow) / logSpan) * plotHeight;
    const span = last.time - first.time;
    const x = (time: number) =>
        span > 0 ? plot.left + ((time - first.time) / span) * (plot.right - plot.left) : plot.left;
    const points =
        samples.length === 1
            ? [
                  { x: plot.left, y: y(first.rank) },
                  { x: plot.right, y: y(first.rank) },
              ]
            : samples.map(point => ({ x: x(point.time), y: y(point.rank) }));
    const line = `M${points.map(point => `${fixed(point.x)} ${fixed(point.y)}`).join(' L')}`;
    const end = points.at(-1) ?? { x: plot.right, y: plot.bottom };
    const bands = tierBands(domain);
    const ticks = rankTicks(domain);
    return {
        area: `${line} L${fixed(end.x)} ${plot.bottom} L${fixed(points[0]?.x ?? plot.left)} ${plot.bottom} Z`,
        bands: bands.map(band => ({
            height: y(band.y2) - y(band.y1),
            label: bandPixelHeight(band, domain, plotHeight) >= MIN_BAND_LABEL_PX,
            tier: band.tier,
            y: y(band.y1),
        })),
        best: samples.reduce(
            (best, point, index) => (point.rank < (samples[best]?.rank ?? Infinity) ? index : best),
            0
        ),
        cuts: bands
            .slice(0, -1)
            .map(band => `M${plot.left} ${fixed(y(band.y2))} H${plot.right}`)
            .join(' '),
        grid: ticks.map(tick => `M${plot.left} ${fixed(y(tick))} H${plot.right}`).join(' '),
        line,
        plot,
        points: samples.length === 1 ? points.slice(1) : points,
        xTicks: timeTicks(first.time, last.time).map(tick => ({
            label: timeLabel(tick, span),
            x: x(tick),
        })),
        yTicks: ticks.map(tick => ({ label: formatRankTick(tick), y: y(tick) })),
    };
};

/** A month tick names its year in January once the span runs past a year. */
const timeLabel = (tick: number, span: number) =>
    span > YEAR_SPAN_MS && new Date(tick).getUTCMonth() === 0
        ? String(new Date(tick).getUTCFullYear())
        : formatTimeTick(tick, span);

const fixed = (value: number) => value.toFixed(1);
