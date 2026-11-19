/**
 * Fits monthly sales against BSR from Amazon's "bought in past month" badge (Keepa `monthlySold`).
 * The badge is a floor on a step scale (50+, 100+ … 900+, 1K+ … 9K+, 10K+ …) and is absent below
 * 50 a month, so each Product says only that its sales lie in an interval. Log sales are modelled
 * as normal (spread `sigma`) around a curve that is linear in log rank on three segments, joined
 * at two bends whose ranks are fitted, and the interval likelihood is maximised. A share `missing`
 * of Products lacks the badge whatever they sell (Keepa gaps), so a fast seller without one does
 * not drag the curve down.
 */

/** Products at one rank with one badge reading; `sold: null` is no badge (under 50 a month). */
export interface SalesObservation {
    readonly bsr: number;
    readonly sold: number | null;
    readonly count: number;
}

/**
 * Log median monthly sales against log rank: `headSlope` before the first bend, `tailSlope` past
 * the second, a straight line between the bends. Slopes are negative and the first bend sells
 * more than the second, so sales never fall as rank improves.
 */
export interface SalesCurve {
    /** The two ranks where the curve bends, best first. */
    readonly knots: readonly [number, number];
    /** Log median monthly sales at each bend. */
    readonly logSalesAtKnots: readonly [number, number];
    /** Power-law exponent on ranks better than the first bend. */
    readonly headSlope: number;
    /** Power-law exponent on ranks worse than the second bend. */
    readonly tailSlope: number;
    /** Spread of log sales around the median. */
    readonly sigma: number;
    /** Share of Products missing the badge whatever they sell. */
    readonly missing: number;
}

/** What evaluating the median needs: the curve without its spread. */
export type SalesCurveShape = Pick<
    SalesCurve,
    'knots' | 'logSalesAtKnots' | 'headSlope' | 'tailSlope'
>;

/** Amazon shows no badge under 50 a month. */
export const BADGE_FLOOR = 50;
/** The ranks a bend may sit at: ×1.5 steps from #20K to #1.15M. */
const BEND_CANDIDATES = Array.from({ length: 11 }, (_, step) => 20_000 * 1.5 ** step);

/** The median monthly sales the curve gives a rank. */
export const curveMedianSales = (curve: SalesCurveShape, bsr: number) => {
    const first = Math.log(curve.knots[0]);
    const second = Math.log(curve.knots[1]);
    const [atFirst, atSecond] = curve.logSalesAtKnots;
    const x = Math.log(bsr);
    if (x < first) {
        return Math.exp(atFirst + curve.headSlope * (x - first));
    }
    if (x > second) {
        return Math.exp(atSecond + curve.tailSlope * (x - second));
    }
    return Math.exp(atFirst + ((atSecond - atFirst) * (x - first)) / (second - first));
};

/** The share of Products at a rank the curve expects to show a badge (sell 50+ a month). */
export const curveBadgeShare = (curve: SalesCurve, bsr: number) =>
    (1 - curve.missing) *
    (1 - normalCdf((Math.log(BADGE_FLOOR) - Math.log(curveMedianSales(curve, bsr))) / curve.sigma));

/**
 * The maximum-likelihood curve, or null when too few badges or ranks pin one down. Each pair of
 * BEND_CANDIDATES at least MIN_BEND_RATIO apart, with MIN_SEGMENT_BADGED badged Products on each
 * of its three segments, gets its own fit; the pair whose fit is likeliest wins and is refined.
 */
export const fitSalesCurve = (observations: readonly SalesObservation[]): SalesCurve | null => {
    const rows = observations.filter(row => row.bsr > 0 && row.count > 0);
    const badged = rows.filter(row => row.sold !== null);
    if (countProducts(badged) < MIN_BADGED) {
        return null;
    }
    const supported = (from: number, to: number) =>
        countProducts(badged.filter(row => row.bsr >= from && row.bsr < to)) >= MIN_SEGMENT_BADGED;
    let best: Profile | null = null;
    for (const first of BEND_CANDIDATES) {
        for (const second of BEND_CANDIDATES) {
            const usable =
                second >= first * MIN_BEND_RATIO &&
                supported(0, first) &&
                supported(first, second) &&
                supported(second, Number.POSITIVE_INFINITY);
            if (!usable) {
                continue;
            }
            const profile = fitWithBends(rows, [first, second], initialTheta([first, second]));
            if (!best || profile.cost < best.cost) {
                best = profile;
            }
        }
    }
    if (!best) {
        return null;
    }
    // A simplex can stall short of the optimum; restarting from where it stopped settles it.
    for (let restart = 0; restart < RESTARTS; restart++) {
        best = fitWithBends(rows, best.knots, best.theta);
    }
    return toCurve(best.knots, best.theta);
};

/** How unlikely the observations are under a curve: lower fits better. */
export const salesCurveNegativeLogLikelihood = (
    observations: readonly SalesObservation[],
    curve: SalesCurve
) => {
    let total = 0;
    for (const row of observations) {
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

/** The step above a badge reading: 50→100, hundreds below 1K, thousands below 10K, and so on. */
export const nextBadge = (sold: number) =>
    sold < 100 ? 100 : sold + 10 ** Math.floor(Math.log10(sold) + 1e-9);

/** Fewest badged Products a fit needs before it says anything. */
const MIN_BADGED = 30;
/** Fewest badged Products on each segment, so no bend is placed past the evidence. */
const MIN_SEGMENT_BADGED = 10;
/** Bends closer than this leave the middle segment too short to measure its slope. */
const MIN_BEND_RATIO = 2;
/** Extra simplex runs for the winning bends, from where the last one stopped. */
const RESTARTS = 2;

interface Profile {
    readonly knots: readonly [number, number];
    readonly theta: readonly number[];
    readonly cost: number;
}

/** The likeliest curve with its bends at fixed ranks, searched from `start`. */
const fitWithBends = (
    rows: readonly SalesObservation[],
    knots: readonly [number, number],
    start: readonly number[]
): Profile => {
    const cost = (theta: readonly number[]) =>
        salesCurveNegativeLogLikelihood(rows, toCurve(knots, theta));
    const theta = nelderMead(cost, start);
    return { knots, theta, cost: cost(theta) };
};

/** A plain power law to start from: 100 a month at #300K, falling 1.3 per unit of log rank. */
const initialTheta = (knots: readonly [number, number]) => {
    const at = (bsr: number) => Math.log(100) - 1.3 * Math.log(bsr / 300_000);
    return [at(knots[0]), 0, Math.log(at(knots[0]) - at(knots[1])), 0, 0, -2];
};

/**
 * Every parameter vector is a valid curve: slopes are minus an exponential, the second bend sells
 * an exponential less than the first, sigma is an exponential and `missing` a logistic.
 */
const toCurve = (
    knots: readonly [number, number],
    [atFirst = 0, logHead = 0, logDrop = 0, logTail = 0, logSigma = 0, logit = 0]: readonly number[]
): SalesCurve => ({
    knots,
    logSalesAtKnots: [atFirst, atFirst - Math.exp(logDrop)],
    headSlope: -Math.exp(logHead),
    tailSlope: -Math.exp(logTail),
    sigma: Math.exp(logSigma),
    missing: 1 / (1 + Math.exp(-logit)),
});

const countProducts = (rows: readonly SalesObservation[]) =>
    rows.reduce((sum, row) => sum + row.count, 0);

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

/** Nelder–Mead simplex minimisation: derivative-free, and plenty for six parameters. */
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
