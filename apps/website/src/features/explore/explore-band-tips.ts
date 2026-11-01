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

/**
 * One monthly-sold bucket of the results, on Amazon's badge steps:
 * `1,204 designs · 100–199/mo`; the first reads `under 100/mo` (the 50+
 * badge), the open last `50,000+/mo`.
 */
export const soldBucketTip = (
    buckets: readonly {
        readonly count: number;
        readonly max: number | null;
        readonly min: number;
    }[],
    index: number
) => {
    const bucket = buckets[index];
    if (!bucket) {
        return null;
    }
    const range =
        bucket.max === null
            ? `${formatCount(bucket.min)}+`
            : bucket.min === 0
              ? `under ${formatCount(bucket.max)}`
              : `${formatCount(bucket.min)}–${formatCount(bucket.max - 1)}`;
    return `${designs(bucket.count)} · ${range}/mo`;
};

const designs = (count: number) => `${formatCount(count)} ${count === 1 ? 'design' : 'designs'}`;
