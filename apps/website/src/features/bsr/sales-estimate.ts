import type { RouterOutputs } from '@/lib/trpc';

export type SalesCurve = NonNullable<RouterOutputs['api']['app']['product']['salesCurve']['curve']>;

/**
 * Estimated units sold a month at a rank, for when Amazon's "bought in past
 * month" badge is absent: the median of the server's current curve, refitted
 * from Merch shirts' badges so it follows the season. Pass the current rank
 * (the curve is fitted against Keepa's current rank). An order of magnitude,
 * never a count; null without a rank or a curve.
 */
export const estimateMonthlySales = (
    salesRank: number | null | undefined,
    curve: SalesCurve | null
): number | null => {
    if (!curve || salesRank === null || salesRank === undefined || salesRank <= 0) {
        return null;
    }
    return Math.max(1, Math.round(curveMonthlySales(curve, salesRank)));
};

/**
 * The curve's median monthly sales at a positive rank, unrounded (for drawing
 * it): linear in log rank on three segments, `headSlope` before the first
 * fitted bend, a straight line between the bends, `tailSlope` past the second.
 * The server's curveMedianSales is the same math.
 */
export const curveMonthlySales = (curve: SalesCurve, salesRank: number) => {
    const first = Math.log(curve.knots[0]);
    const second = Math.log(curve.knots[1]);
    const [atFirst, atSecond] = curve.logSalesAtKnots;
    const x = Math.log(salesRank);
    if (x < first) {
        return Math.exp(atFirst + curve.headSlope * (x - first));
    }
    if (x > second) {
        return Math.exp(atSecond + curve.tailSlope * (x - second));
    }
    return Math.exp(atFirst + ((atSecond - atFirst) * (x - first)) / (second - first));
};

/**
 * A monthly sales figure as a pace people read at a glance: `≈14 a day`,
 * `≈1 a day`, or `≈1 every 3 days` below that.
 */
export const formatSalesPace = (monthly: number) => {
    const daily = monthly / 30;
    if (daily >= 1.5) {
        return `≈${Math.round(daily)} a day`;
    }
    if (daily >= 0.75) {
        return '≈1 a day';
    }
    return `≈1 every ${Math.max(2, Math.round(1 / daily))} days`;
};
