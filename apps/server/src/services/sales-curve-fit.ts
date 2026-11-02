/**
 * Fits monthly sales against BSR from Amazon's "bought in past month" badge (Keepa `monthlySold`).
 * The badge is a floor on a step scale (50+, 100+ … 900+, 1K+ … 9K+, 10K+ …) and is absent below
 * 50 a month, so each Product says only that its sales lie in an interval. Log sales are modelled
 * as normal (spread `sigma`) around a power law in rank that bends at REFERENCE_BSR: `headSlope`
 * above it, `tailSlope` below, where sales thin out faster. The interval likelihood is maximised.
 * A share `missing` of Products lacks the badge whatever they sell (Keepa gaps), so a fast seller
 * without one does not drag the curve down.
 */

/** Products at one rank with one badge reading; `sold: null` is no badge (under 50 a month). */
export interface SalesObservation {
    readonly bsr: number;
    readonly sold: number | null;
    readonly count: number;
}

export interface SalesCurve {
    /** Log median monthly sales at REFERENCE_BSR. */
    readonly intercept: number;
    /** Power-law exponent on ranks better than REFERENCE_BSR (negative: better sells more). */
    readonly headSlope: number;
    /** Power-law exponent on ranks worse than REFERENCE_BSR. */
    readonly tailSlope: number;
    /** Spread of log sales around the median. */
    readonly sigma: number;
    /** Share of Products missing the badge whatever they sell. */
    readonly missing: number;
}

/** Where the curve bends: past it, badges thin out much faster than above it. */
export const REFERENCE_BSR = 300_000;
/** Amazon shows no badge under 50 a month. */
export const BADGE_FLOOR = 50;

/** The median monthly sales the curve gives a rank. */
export const curveMedianSales = (
    curve: Pick<SalesCurve, 'intercept' | 'headSlope' | 'tailSlope'>,
    bsr: number
) =>
    Math.exp(
        curve.intercept +
            (bsr < REFERENCE_BSR ? curve.headSlope : curve.tailSlope) *
                Math.log(bsr / REFERENCE_BSR)
    );

/** The share of Products at a rank the curve expects to show a badge (sell 50+ a month). */
export const curveBadgeShare = (curve: SalesCurve, bsr: number) =>
    (1 - curve.missing) *
    (1 - normalCdf((Math.log(BADGE_FLOOR) - Math.log(curveMedianSales(curve, bsr))) / curve.sigma));

/** The maximum-likelihood curve, or null when too few badges or ranks pin one down. */
export const fitSalesCurve = (observations: readonly SalesObservation[]): SalesCurve | null => {
    const rows = observations.filter(row => row.bsr > 0 && row.count > 0);
    const badged = rows.reduce((sum, row) => sum + (row.sold === null ? 0 : row.count), 0);
    const spread = new Set(rows.map(row => Math.round(Math.log10(row.bsr))));
    if (badged < MIN_BADGED || spread.size < 2) {
        return null;
    }
    const cost = (theta: readonly number[]) => negativeLogLikelihood(rows, toCurve(theta));
    // A simplex can stall short of the optimum; restarting from where it stopped settles it.
    let theta: readonly number[] = [Math.log(100), -1, -1, 0, -2];
    for (let restart = 0; restart < RESTARTS; restart++) {
        theta = nelderMead(cost, theta);
    }
    return toCurve(theta);
};

/** The step above a badge reading: 50→100, hundreds below 1K, thousands below 10K, and so on. */
export const nextBadge = (sold: number) =>
    sold < 100 ? 100 : sold + 10 ** Math.floor(Math.log10(sold) + 1e-9);

/** Fewest badged Products a fit needs before it says anything. */
const MIN_BADGED = 30;
const RESTARTS = 3;

const toCurve = ([
    intercept = 0,
    headSlope = 0,
    tailSlope = 0,
    logSigma = 0,
    logit = 0,
]: readonly number[]) =>
    ({
        intercept,
        headSlope,
        tailSlope,
        sigma: Math.exp(logSigma),
        missing: 1 / (1 + Math.exp(-logit)),
    }) satisfies SalesCurve;

const negativeLogLikelihood = (rows: readonly SalesObservation[], curve: SalesCurve) => {
    let total = 0;
    for (const row of rows) {
        const mu = Math.log(curveMedianSales(curve, row.bsr));
        const below = (value: number) => normalCdf((Math.log(value) - mu) / curve.sigma);
        const probability =
            row.sold === null
                ? curve.missing + (1 - curve.missing) * below(BADGE_FLOOR)
                : (1 - curve.missing) * (below(nextBadge(row.sold)) - below(row.sold));
        total -= row.count * Math.log(Math.max(probability, 1e-12));
    }
    return total;
};

/** Standard normal CDF through the Abramowitz–Stegun erf approximation (error under 1.5e-7). */
const normalCdf = (z: number) => {
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const poly =
        t *
        (0.254829592 +
            t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erf = 1 - poly * Math.exp(-x * x);
    return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};

interface Vertex {
    readonly point: readonly number[];
    readonly value: number;
}

/** Nelder–Mead simplex minimisation: derivative-free, and plenty for five parameters. */
const nelderMead = (cost: (point: readonly number[]) => number, start: readonly number[]) => {
    const vertex = (point: readonly number[]): Vertex => ({ point, value: cost(point) });
    let simplex = [
        vertex(start),
        ...start.map((_, axis) => vertex(start.map((v, i) => (i === axis ? v + 0.5 : v)))),
    ];
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        simplex.sort((a, b) => a.value - b.value);
        const best = simplex[0] as Vertex;
        const worst = simplex.at(-1) as Vertex;
        if (worst.value - best.value < 1e-9) {
            break;
        }
        const kept = simplex.slice(0, -1);
        const centroid = start.map(
            (_, i) => kept.reduce((sum, v) => sum + (v.point[i] ?? 0), 0) / kept.length
        );
        const along = (scale: number) =>
            vertex(centroid.map((c, i) => c + scale * ((worst.point[i] ?? 0) - c)));
        const reflected = along(-1);
        if (reflected.value < best.value) {
            const expanded = along(-2);
            simplex = [...kept, expanded.value < reflected.value ? expanded : reflected];
        } else if (reflected.value < (kept.at(-1) as Vertex).value) {
            simplex = [...kept, reflected];
        } else {
            const contracted = along(0.5);
            simplex =
                contracted.value < worst.value
                    ? [...kept, contracted]
                    : simplex.map(v => vertex(halfway(best.point, v.point)));
        }
    }
    return simplex.reduce((a, b) => (b.value < a.value ? b : a)).point;
};

const MAX_ITERATIONS = 2_000;

const halfway = (from: readonly number[], to: readonly number[]) =>
    to.map((value, i) => (from[i] ?? 0) + 0.5 * (value - (from[i] ?? 0)));
