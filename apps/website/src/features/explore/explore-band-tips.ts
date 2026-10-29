import { formatCount, formatShortDate } from '@/features/bsr/bsr-format';
import { type BsrTier, bsrTierDefinitions } from '@/features/bsr/bsr-tier';

/**
 * What each Explore KPI band reads under the pointer: the bucket, day or bin
 * a dot column draws, said in words (Grid J bands, user feedback: every data
 * mark gets a hover tooltip).
 */

/** `#2,501–#4,000 · Hot · 12 designs`; the open last bucket reads `#2M+`. */
export const bsrBucketTip = (
    buckets: readonly {
        readonly bucketMax: number;
        readonly count: number;
        readonly tier: BsrTier;
    }[],
    index: number
) => {
    const bucket = buckets[index];
    if (!bucket) {
        return null;
    }
    const low = (buckets[index - 1]?.bucketMax ?? 0) + 1;
    const range =
        index === buckets.length - 1
            ? `#${formatCount(low)}+`
            : `#${formatCount(low)}–#${formatCount(bucket.bucketMax)}`;
    return `${range} · ${bsrTierDefinitions[bucket.tier].label} · ${designs(bucket.count)}`;
};

/** `Oct 21 · 3 published`. */
export const publishedDayTip = (
    days: readonly { readonly day: string; readonly count: number }[],
    index: number
) => {
    const day = days[index];
    return day
        ? `${formatShortDate(`${day.day}T00:00:00Z`)} · ${formatCount(day.count)} published`
        : null;
};

/** The improving meter's figure and what it counts. */
export const improvingTip = (share: number | null) =>
    share === null
        ? 'Not enough history to compare a week back'
        : `${Math.round(share * 100)}% of results ranked better than 7 days ago`;

/** One bin of the page's sold-a-month spread: `4 designs · ~120–310/mo on this page`. */
export interface SoldBin {
    readonly low: number;
    readonly high: number;
    readonly count: number;
}

export const soldBinTip = (bins: readonly SoldBin[], index: number) => {
    const bin = bins[index];
    if (!bin) {
        return null;
    }
    const range =
        bin.low === bin.high
            ? formatCount(bin.low)
            : `${formatCount(bin.low)}–${formatCount(bin.high)}`;
    return `${designs(bin.count)} · ~${range}/mo on this page`;
};

/** The page's sold-a-month figures binned on a log scale. */
export const soldBins = (values: readonly number[], binCount = 18): SoldBin[] => {
    if (values.length === 0) {
        return [];
    }
    const high = Math.log1p(Math.max(...values));
    const edge = (index: number) => Math.round(Math.expm1((index / (binCount - 1)) * high));
    const bins = Array.from({ length: binCount }, (_, index) => ({
        count: 0,
        high: edge(index + 1) - 1,
        low: edge(index),
    }));
    for (const value of values) {
        const index = high > 0 ? Math.floor((Math.log1p(value) / high) * (binCount - 1)) : 0;
        const bin = bins[index];
        if (bin) {
            bin.count += 1;
        }
    }
    return bins.map(bin => ({ ...bin, high: Math.max(bin.low, bin.high) }));
};

const designs = (count: number) => `${formatCount(count)} ${count === 1 ? 'design' : 'designs'}`;
