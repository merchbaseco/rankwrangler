export const BSR_THRESHOLD_200K = 200000;
export const BSR_THRESHOLD_500K = 500000;
export const BSR_THRESHOLD_1M = 1000000;
export const BSR_THRESHOLD_3M = 3000000;

export const REFRESH_AFTER_24_HOURS_MS = 24 * 60 * 60 * 1000;
export const REFRESH_AFTER_3_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
export const REFRESH_AFTER_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_AFTER_14_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
export const REFRESH_AFTER_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type SpApiRefreshPolicyBucket = {
    key: string;
    label: string;
    minBsrInclusive: number;
    maxBsrExclusive: number | null;
    refreshAfterMs: number;
    refreshEveryLabel: string;
};

export const SPAPI_REFRESH_POLICY_BUCKETS = [
    {
        key: 'lt200k',
        label: '< 200k',
        minBsrInclusive: 0,
        maxBsrExclusive: BSR_THRESHOLD_200K,
        refreshAfterMs: REFRESH_AFTER_24_HOURS_MS,
        refreshEveryLabel: 'Daily',
    },
    {
        key: '200kTo500k',
        label: '200k – 500k',
        minBsrInclusive: BSR_THRESHOLD_200K,
        maxBsrExclusive: BSR_THRESHOLD_500K,
        refreshAfterMs: REFRESH_AFTER_3_DAYS_MS,
        refreshEveryLabel: '3 days',
    },
    {
        key: '500kTo1m',
        label: '500k – 1M',
        minBsrInclusive: BSR_THRESHOLD_500K,
        maxBsrExclusive: BSR_THRESHOLD_1M,
        refreshAfterMs: REFRESH_AFTER_7_DAYS_MS,
        refreshEveryLabel: 'Weekly',
    },
    {
        key: '1mTo3m',
        label: '1M – 3M',
        minBsrInclusive: BSR_THRESHOLD_1M,
        maxBsrExclusive: BSR_THRESHOLD_3M,
        refreshAfterMs: REFRESH_AFTER_14_DAYS_MS,
        refreshEveryLabel: '14 days',
    },
    {
        key: 'gte3m',
        label: '≥ 3M',
        minBsrInclusive: BSR_THRESHOLD_3M,
        maxBsrExclusive: null,
        refreshAfterMs: REFRESH_AFTER_30_DAYS_MS,
        refreshEveryLabel: '30 days',
    },
] as const satisfies readonly SpApiRefreshPolicyBucket[];

export type SpApiRefreshPolicyBucketKey = (typeof SPAPI_REFRESH_POLICY_BUCKETS)[number]['key'];
