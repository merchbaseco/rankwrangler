import type { RouterOutputs } from '@/lib/trpc';

export type SalesCurve = NonNullable<RouterOutputs['api']['app']['product']['salesCurve']['curve']>;

/**
 * Estimated units sold a month at a rank, for when Amazon's "bought in past
 * month" badge is absent: the median of the server's current curve, refitted
 * from Merch shirts' badges so it follows the season. Pass the 30-day average
 * rank where there is one (the curve is fitted against it). An order of
 * magnitude, never a count; null without a rank or a curve.
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

/** The curve's median monthly sales at a positive rank, unrounded (for drawing it). */
export const curveMonthlySales = (curve: SalesCurve, salesRank: number) => {
    const slope = salesRank < curve.referenceBsr ? curve.headSlope : curve.tailSlope;
    return Math.exp(curve.intercept + slope * Math.log(salesRank / curve.referenceBsr));
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
