/**
 * BSR tiers: the server copy of the website's rank classification
 * (`apps/website/src/features/bsr/bsr-tier.ts`). Thresholds are inclusive upper bounds on the
 * main-category BSR. A missing or non-positive rank is `slow`, so the five tiers partition every
 * Product and their counts sum to the result total.
 */
export const bsrTierKeys = ['elite', 'hot', 'strong', 'steady', 'slow'] as const;
export type BsrTier = (typeof bsrTierKeys)[number];

export const bsrTierMax = {
    elite: 2_500,
    hot: 15_000,
    strong: 60_000,
    steady: 250_000,
    slow: null,
} as const satisfies Record<BsrTier, number | null>;

/** Inclusive rank bounds of one tier; `slow` is open-ended above. */
export const bsrTierRange = (tier: BsrTier): Readonly<{ min: number; max: number | null }> => {
    const index = bsrTierKeys.indexOf(tier);
    const previous = index > 0 ? bsrTierMax[bsrTierKeys[index - 1]] : 0;
    return { min: (previous ?? 0) + 1, max: bsrTierMax[tier] };
};

export const classifyBsrTier = (rank: number | null | undefined): BsrTier => {
    if (rank === null || rank === undefined || rank <= 0) return 'slow';
    return (
        bsrTierKeys.find(tier => (bsrTierMax[tier] ?? Number.POSITIVE_INFINITY) >= rank) ?? 'slow'
    );
};

/** Sub-buckets per tier for the KPI histogram; 24 in all, log-spaced inside each tier. */
const HISTOGRAM_SPLITS = { elite: 8, hot: 3, strong: 3, steady: 3, slow: 7 } as const;
/** Nominal top of the open-ended last bucket; ranks above it still count in that bucket. */
const HISTOGRAM_CEILING = 5_000_000;

/** Two significant figures; defined above its module-load use. */
const roundSignificant = (value: number) => {
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
    return Math.round(value / magnitude) * magnitude;
};

export interface BsrHistogramBucket {
    /** Exclusive lower bound (0 for the first bucket). */
    readonly min: number;
    /** Inclusive upper bound; the last bucket is open-ended and this is its nominal top. */
    readonly bucketMax: number;
    readonly open: boolean;
    readonly tier: BsrTier;
}

/**
 * Log-spaced buckets aligned to tier boundaries, so each bucket has exactly one tier colour.
 * Interior bounds round to two significant figures; tier bounds stay exact.
 */
export const bsrHistogramBuckets: readonly BsrHistogramBucket[] = bsrTierKeys.flatMap(tier => {
    const { min } = bsrTierRange(tier);
    const top = bsrTierMax[tier] ?? HISTOGRAM_CEILING;
    const splits = HISTOGRAM_SPLITS[tier];
    const ratio = (top / min) ** (1 / splits);
    return Array.from({ length: splits }, (_, index) => {
        const last = index === splits - 1;
        const upper = last ? top : roundSignificant(min * ratio ** (index + 1));
        const lower = index === 0 ? min - 1 : roundSignificant(min * ratio ** index);
        return { min: lower, bucketMax: upper, open: last && tier === 'slow', tier };
    });
});
