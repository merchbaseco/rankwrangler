import { formatBsrCompact, formatCompact, formatCount, formatShortDate } from '@/features/bsr/bsr-format';
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

/**
 * The two ends of each band, named under it so its scale reads without
 * hovering (user feedback: the published band only read as a month once
 * hovered). Null while a band has no buckets.
 */

/** `#1` … `#2M+`: the BSR histogram runs best rank to worst. */
export const bsrAxis = (buckets: readonly { readonly bucketMax: number }[]) => {
    const low = buckets.at(-2)?.bucketMax;
    return low === undefined ? null : (['#1', `${formatBsrCompact(low + 1)}+`] as const);
};

/** `<100/mo` … `50K+/mo`: the sold histogram's first and open last badge steps. */
export const soldAxis = (
    buckets: readonly { readonly max: number | null; readonly min: number }[]
) => {
    const first = buckets[0];
    const last = buckets.at(-1);
    return first?.max && last
        ? ([`<${formatCompact(first.max)}/mo`, `${formatCompact(last.min)}+/mo`] as const)
        : null;
};

/** `Sep 4` … `Today`: the published series' first day, then today. */
export const publishedAxis = (days: readonly { readonly day: string }[]) => {
    const first = days[0];
    return first ? ([formatShortDate(`${first.day}T00:00:00Z`), 'Today'] as const) : null;
};

const designs = (count: number) => `${formatCount(count)} ${count === 1 ? 'design' : 'designs'}`;
