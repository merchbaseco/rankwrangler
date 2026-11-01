import { formatBsrCompact, formatCompact } from '@/features/bsr/bsr-format';
import { type BsrTier, bsrTiers, classifyBsr, tierRankRange } from '@/features/bsr/bsr-tier';
import { curveMonthlySales, formatSalesPace, type SalesCurve } from '@/features/bsr/sales-estimate';

/** The ranks the chart spans, on a log scale (best on the left). */
export const RANK_DOMAIN = [30_000, 3_000_000] as const;
/** Monthly sales up the chart, on a log scale. */
const SALES_TOP = 3_000;
/** The ranks whose pace is written on the curve; everything else reads on hover. */
const CALLOUT_RANKS = [100_000, 300_000, 1_000_000] as const;
const SALES_TICKS = [1, 10, 100, 1_000] as const;
const RANK_TICKS = [50_000, 100_000, 300_000, 1_000_000, 2_000_000] as const;
const SAMPLES = 120;
/** One character of a callout label in the figures face, for keeping labels inside the plot. */
const CHAR_WIDTH = 7.5;
const LABEL_GAP = 8;
/** Under this plot width the rank axis keeps only the callout ranks, so labels never touch. */
const NARROW_PLOT = 480;
const PAD = { bottom: 24, left: 40, right: 12, top: 8 } as const;

export interface CurveEvidence {
    readonly bsr: number;
    readonly typicalSales: number;
}

/**
 * The sales curve's drawing at a pixel size: tier bands across the rank
 * axis, the median curve and the range most shirts land in (median ×/÷ e^σ),
 * the typical badged shirt per rank bin, and the paces written at the callout
 * ranks. `rankAt` maps a pointer x back to a rank for the hover readout.
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
    const trace = (ranks: readonly number[], scale: number) =>
        ranks.map(rank => `${round(x(rank))},${round(y(median(rank) * scale))}`).join(' L');
    const spread = Math.exp(curve.sigma);
    return {
        plot,
        bands: bsrTiers.flatMap(tier => tierBand(tier, x)),
        grid: SALES_TICKS.map(sales => `M${plot.left},${round(y(sales))}H${plot.right}`).join(''),
        line: `M${trace(samples, 1)}`,
        range: `M${trace(samples, spread)} L${trace([...samples].reverse(), 1 / spread)} Z`,
        evidence: evidence
            .filter(dot => dot.bsr >= RANK_DOMAIN[0] && dot.bsr <= RANK_DOMAIN[1])
            .map(dot => ({ tier: classifyBsr(dot.bsr), x: x(dot.bsr), y: y(dot.typicalSales) })),
        callouts: CALLOUT_RANKS.map(rank => {
            const label = formatSalesPace(median(rank));
            // A label that would run off the right edge sits to the left of its point instead.
            const fits = x(rank) + LABEL_GAP + label.length * CHAR_WIDTH <= plot.right;
            return {
                anchor: fits ? ('start' as const) : ('end' as const),
                label,
                labelX: x(rank) + (fits ? LABEL_GAP : -LABEL_GAP),
                x: x(rank),
                y: y(median(rank)),
            };
        }),
        xTicks: (plot.right - plot.left < NARROW_PLOT ? CALLOUT_RANKS : RANK_TICKS).map(rank => ({
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

/**
 * The accuracy check's columns: per rank range, the share of shirts showing
 * a badge as a column (24px at most, rounded only at its top) and the share
 * the curve expects as a tick across it, on a 0–100% scale. The rank axis
 * labels the edges between ranges (`#40K`, `#60K` …), every other one when
 * the columns run narrow.
 */
export const accuracyBarsGeometry = (
    rows: readonly {
        readonly actual: number;
        readonly expected: number;
        readonly max: number;
        readonly min: number;
    }[],
    { height, width }: { height: number; width: number }
) => {
    const plot = { bottom: height - PAD.bottom, left: PAD.left, right: width - PAD.right, top: 8 };
    const slot = (plot.right - plot.left) / Math.max(1, rows.length);
    const y = (share: number) => plot.bottom - share * (plot.bottom - plot.top);
    const column = Math.min(24, slot * 0.5);
    return {
        plot,
        grid: [0.25, 0.5, 0.75, 1]
            .map(share => `M${plot.left},${round(y(share))}H${plot.right}`)
            .join(''),
        yTicks: [0, 0.5, 1].map(share => ({ label: `${share * 100}%`, y: y(share) })),
        bars: rows.map((row, index) => {
            const center = plot.left + slot * (index + 0.5);
            const top = y(row.actual);
            const radius = Math.min(4, plot.bottom - top);
            const left = center - column / 2;
            return {
                center,
                column: `M${round(left)},${plot.bottom}V${round(top + radius)}Q${round(left)},${round(top)} ${round(left + radius)},${round(top)}H${round(left + column - radius)}Q${round(left + column)},${round(top)} ${round(left + column)},${round(top + radius)}V${plot.bottom}Z`,
                expected: {
                    x1: center - Math.min(16, slot * 0.35),
                    x2: center + Math.min(16, slot * 0.35),
                    y: y(row.expected),
                },
                slot: { width: slot, x: plot.left + slot * index },
            };
        }),
        edges: rows
            .flatMap((row, index) => (index === rows.length - 1 ? [row.min, row.max] : [row.min]))
            .map((rank, index) => ({ label: formatBsrCompact(rank), x: plot.left + slot * index }))
            .filter((_, index) => slot >= MIN_LABELLED_SLOT || index % 2 === 0),
    };
};

/** Narrower columns than this label every other edge, so the labels never touch. */
const MIN_LABELLED_SLOT = 44;

/** One tier's slice of the rank axis, or nothing when it falls outside the chart. */
const tierBand = (tier: BsrTier, x: (rank: number) => number) => {
    const { max, min } = tierRankRange(tier);
    const from = Math.max(min, RANK_DOMAIN[0]);
    const to = Math.min(max ?? Number.POSITIVE_INFINITY, RANK_DOMAIN[1]);
    return to > from ? [{ tier, width: x(to) - x(from), x: x(from) }] : [];
};

const round = (value: number) => Math.round(value * 10) / 10;
