import { daysSince, formatCompact, formatCount } from '@/features/bsr/bsr-format';
import { type BsrTier, classifyBsr, estimateMonthlySales } from '@/features/bsr/bsr-tier';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import type { ExploreProduct } from './use-explore-products';

/** A `product.search` item with the figures the grid derives from it. */
export interface ExploreRow extends ExploreProduct {
    /** 1-based place in the whole ordering (page offset included). */
    readonly position: number;
    readonly tier: BsrTier;
    /**
     * BSR move over seven days in percent, from the daily `bsr30d` samples:
     * positive is a better (lower) rank. Null without a sample a week back.
     */
    readonly delta7d: number | null;
    /**
     * Amazon's "bought in past month" bucket when present (shown `900+`), else
     * the BSR estimate (shown `~787`). `share` is the value over the page's
     * largest, for the cell's neutral bar.
     */
    readonly sold: {
        readonly value: number;
        readonly isEstimate: boolean;
        readonly share: number;
    } | null;
    /** BSR drops over 30 days (each a likely sale), when Keepa has counted them. */
    readonly drops: number | null;
    readonly ageDays: number | null;
}

const WEEK_MS = 7 * 86_400_000;
/** A sample counts as "a week back" within a day of it. */
const WEEK_TOLERANCE_MS = 86_400_000;

export const toExploreRows = (
    products: readonly ExploreProduct[],
    { now = Date.now(), offset = 0 }: { now?: number; offset?: number } = {}
): ExploreRow[] => {
    const sold = products.map(soldPerMonth);
    const most = Math.max(0, ...sold.map(figure => figure?.value ?? 0));
    return products.map((product, index) => {
        const figure = sold[index] ?? null;
        return {
            ...product,
            ageDays: daysSince(product.firstAvailableAt, now),
            delta7d: weekMove(product.bsr30d),
            drops: product.demand.salesRankDrops?.last30Days ?? null,
            position: offset + index + 1,
            sold: figure ? { ...figure, share: most > 0 ? figure.value / most : 0 } : null,
            tier: classifyBsr(product.salesRank),
        };
    });
};

/**
 * The seven-day BSR move of a daily series: the latest sample against the one
 * nearest a week before it, as a percent of the older rank (the mock's Δ7D).
 */
export const weekMove = (series: readonly RankPoint[]): number | null => {
    const latest = series.at(-1);
    if (!latest || latest.salesRank <= 0) {
        return null;
    }
    const target = Date.parse(latest.at) - WEEK_MS;
    let best: RankPoint | null = null;
    for (const point of series) {
        const distance = Math.abs(Date.parse(point.at) - target);
        if (
            distance <= WEEK_TOLERANCE_MS &&
            (best === null || distance < Math.abs(Date.parse(best.at) - target))
        ) {
            best = point;
        }
    }
    if (!best || best.salesRank <= 0) {
        return null;
    }
    return Math.round(((best.salesRank - latest.salesRank) / best.salesRank) * 100);
};

/** `+12%`, `−8%`, `+0%` with a real minus sign (table cells). */

/**
 * Sold a month for the grid: Amazon's "bought in past month" badge is a
 * bucket floor (Keepa's `monthlySold`: 50, 100, 200 … 900, 1K, 2K …), shown
 * as `900+` / `1K+`; any other reported figure is exact (`781`, never `781+`);
 * the BSR estimate reads `~1,149`.
 */
export const formatSold = (sold: Pick<NonNullable<ExploreRow['sold']>, 'isEstimate' | 'value'>) => {
    if (sold.isEstimate) {
        return `~${formatCount(sold.value)}`;
    }
    return isAmazonBucket(sold.value) ? `${formatCompact(sold.value)}+` : formatCount(sold.value);
};

/** Amazon's badge buckets: 50, then hundreds below 1K, then whole thousands. */
const isAmazonBucket = (value: number) =>
    value === 50 ||
    (value >= 100 && value < 1000 ? value % 100 === 0 : value >= 1000 && value % 1000 === 0);

/** `412d`, or `1.2y` past a year. */
export const formatAge = (days: number | null) => {
    if (days === null) {
        return '—';
    }
    return days >= 365 ? `${(days / 365).toFixed(1)}y` : `${days}d`;
};

const soldPerMonth = (product: ExploreProduct) => {
    const reported = product.demand.boughtInPastMonth;
    if (reported !== null && reported !== undefined) {
        return { isEstimate: false, value: reported };
    }
    const estimate = estimateMonthlySales(product.salesRank);
    return estimate === null ? null : { isEstimate: true, value: estimate };
};
