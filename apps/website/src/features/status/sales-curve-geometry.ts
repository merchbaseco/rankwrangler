import { formatBsrCompact, formatCompact } from '@/features/bsr/bsr-format';
import { type BsrTier, bsrTiers, classifyBsr, tierRankRange } from '@/features/bsr/bsr-tier';
import { curveMonthlySales, type SalesCurve } from '@/features/bsr/sales-estimate';

/** The ranks the chart spans, on a log scale (best on the left). */
export const RANK_DOMAIN = [30_000, 3_000_000] as const;
/** Monthly sales up the chart, on a log scale. */
const SALES_TOP = 3_000;
const SALES_TICKS = [1, 10, 100, 1_000] as const;
const RANK_TICKS = [50_000, 100_000, 300_000, 1_000_000, 2_000_000] as const;
/** Under this plot width the rank axis keeps only the tier edges, so labels never touch. */
const NARROW_PLOT = 480;
const NARROW_TICKS = [100_000, 300_000, 1_000_000] as const;
const SAMPLES = 120;
/** The tier rail under the plot, and the gap above it. */
const RAIL = { gap: 6, height: 3 } as const;
const PAD = { bottom: 32, left: 40, right: 12, top: 22 } as const;

export interface CurveEvidence {
    readonly bsr: number;
    readonly typicalSales: number;
}

/**
 * The sales curve's drawing at a pixel size, in the Product rank chart's
 * idiom: the median curve as an ink line over a halftone fill down to the
 * axis, clipped into tier slices so each takes its tier's ink; dashed cuts at
 * the tier edges, each tier named above its slice and railed below it; and
 * the typical badged shirt per rank bin. `rankAt` maps a pointer x back to a
 * rank for the hover readout.
 */
export const salesCurveGeometry = (
    curve: SalesCurve,
    evidence: readonly CurveEvidence[],
    { height, width }: { height: number; width: number }
) => {
    const plot = {
        bottom: height - PAD.bottom,
        left: PAD.left,
        right: width - PAD.right,
        top: PAD.top,
    };
    const low = Math.log(RANK_DOMAIN[0]);
    const span = Math.log(RANK_DOMAIN[1]) - low;
    const x = (rank: number) =>
        plot.left + ((Math.log(rank) - low) / span) * (plot.right - plot.left);
    const y = (sales: number) => {
        const clamped = Math.min(SALES_TOP, Math.max(1, sales));
        const share = (Math.log(SALES_TOP) - Math.log(clamped)) / Math.log(SALES_TOP);
        return plot.top + share * (plot.bottom - plot.top);
    };
    const median = (rank: number) => curveMonthlySales(curve, rank);
    const samples = Array.from({ length: SAMPLES + 1 }, (_, i) =>
        Math.exp(low + (span * i) / SAMPLES)
    );
    const line = `M${samples.map(rank => `${round(x(rank))},${round(y(median(rank)))}`).join(' L')}`;
    const bands = bsrTiers.flatMap(tier => tierBand(tier, x));
    return {
        plot,
        bands,
        rail: { height: RAIL.height, y: plot.bottom + RAIL.gap },
        cuts: bands
            .slice(1)
            .map(band => `M${round(band.x)},${plot.top}V${plot.bottom}`)
            .join(''),
        grid: SALES_TICKS.map(sales => `M${plot.left},${round(y(sales))}H${plot.right}`).join(''),
        line,
        area: `${line} L${plot.right},${plot.bottom} L${plot.left},${plot.bottom} Z`,
        evidence: evidence
            .filter(dot => dot.bsr >= RANK_DOMAIN[0] && dot.bsr <= RANK_DOMAIN[1])
            .map(dot => ({ tier: classifyBsr(dot.bsr), x: x(dot.bsr), y: y(dot.typicalSales) })),
        xTicks: (plot.right - plot.left < NARROW_PLOT ? NARROW_TICKS : RANK_TICKS).map(rank => ({
            label: formatBsrCompact(rank),
            x: x(rank),
        })),
        yTicks: SALES_TICKS.map(sales => ({ label: formatCompact(sales), y: y(sales) })),
        rankAt: (px: number) => {
            const clamped = Math.min(plot.right, Math.max(plot.left, px));
            return Math.exp(low + ((clamped - plot.left) / (plot.right - plot.left)) * span);
        },
        pointAt: (rank: number) => ({ x: x(rank), y: y(median(rank)) }),
    };
};

/** One tier's slice of the rank axis, or nothing when it falls outside the chart. */
const tierBand = (tier: BsrTier, x: (rank: number) => number) => {
    const { max, min } = tierRankRange(tier);
    const from = Math.max(min, RANK_DOMAIN[0]);
    const to = Math.min(max ?? Number.POSITIVE_INFINITY, RANK_DOMAIN[1]);
    return to > from ? [{ tier, width: x(to) - x(from), x: x(from) }] : [];
};

const round = (value: number) => Math.round(value * 10) / 10;
