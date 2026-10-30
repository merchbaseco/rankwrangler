const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MINUTE_IN_MS = 60 * 1000;

export const KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD = 50000;
export const KEEPA_DAILY_AUTO_BSR_THRESHOLD = 300000;
export const KEEPA_WEEKLY_AUTO_BSR_THRESHOLD = 1000000;
export const KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = DAY_IN_MS / 2;
export const KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = DAY_IN_MS;
export const KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = 7 * DAY_IN_MS;
export const KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS = DAY_IN_MS / 2;
export const KEEPA_FAILURE_RETRY_BASE_MS = 5 * MINUTE_IN_MS;
export const KEEPA_FAILURE_RETRY_MAX_MS = DAY_IN_MS;
// Tokens left after tier-due work refresh admitted Merch Products again once they are this stale,
// best BSR first, so the plan's refill is spent instead of expiring in a full bucket.
export const KEEPA_SPARE_REFRESH_MIN_INTERVAL_MS = DAY_IN_MS;
// The scheduled top-up keeps about this much refill queued: enough that the bucket drains between
// scans, short enough that newly due tier work never waits long behind spare work.
export const KEEPA_REFRESH_QUEUE_TARGET_MINUTES = 30;
export const KEEPA_REFRESH_QUEUE_FALLBACK_TARGET = 600;

type KeepaRefreshPolicyBucket = {
    key: string;
    label: string;
    refreshEveryLabel: string;
    hint: string | null;
    isAutoRefresh: boolean;
};

export const KEEPA_REFRESH_POLICY_BUCKETS = [
    {
        key: 'daily',
        label: '< 300k',
        refreshEveryLabel: '12–24h',
        hint: 'Every 12 hours under 50k BSR, daily otherwise.',
        isAutoRefresh: true,
    },
    {
        key: 'weekly',
        label: '300k – 1M',
        refreshEveryLabel: 'Weekly',
        hint: 'At least weekly; refreshed daily with spare tokens.',
        isAutoRefresh: true,
    },
    {
        key: 'onDemand',
        label: '≥ 1M',
        refreshEveryLabel: 'Spare tokens',
        hint: 'Admitted Products refresh daily with spare tokens, best BSR first; others when opened.',
        isAutoRefresh: false,
    },
    {
        key: 'merchMissingBsr',
        label: 'No BSR',
        refreshEveryLabel: 'Never',
        hint: 'Merch listings Amazon reports without a BSR.',
        isAutoRefresh: false,
    },
    {
        key: 'unknown',
        label: 'Unclassified',
        refreshEveryLabel: 'Never',
        hint: 'Not yet classified as Merch or non-Merch.',
        isAutoRefresh: false,
    },
    {
        key: 'nonMerch',
        label: 'Non-Merch',
        refreshEveryLabel: 'Never',
        hint: null,
        isAutoRefresh: false,
    },
] as const satisfies readonly KeepaRefreshPolicyBucket[];

export type KeepaRefreshPolicyBucketKey = (typeof KEEPA_REFRESH_POLICY_BUCKETS)[number]['key'];

export const getKeepaRefreshPolicyBucketKey = (
    isMerchListing: boolean | null,
    rootCategoryBsr: number | null
) => {
    if (isMerchListing === null) {
        return 'unknown' as const;
    }

    if (!isMerchListing) {
        return 'nonMerch' as const;
    }

    if (typeof rootCategoryBsr !== 'number' || !Number.isFinite(rootCategoryBsr)) {
        return 'merchMissingBsr' as const;
    }

    if (rootCategoryBsr < KEEPA_DAILY_AUTO_BSR_THRESHOLD) {
        return 'daily' as const;
    }

    if (rootCategoryBsr < KEEPA_WEEKLY_AUTO_BSR_THRESHOLD) {
        return 'weekly' as const;
    }

    return 'onDemand' as const;
};

export const isEligibleForKeepaHistoryRefresh = (
    isMerchListing: boolean | null,
    rootCategoryBsr: number | null
) => {
    const policyBucket = getKeepaRefreshPolicyBucketKey(isMerchListing, rootCategoryBsr);
    return policyBucket === 'daily' || policyBucket === 'weekly';
};

export const getKeepaEnqueueMinRefreshIntervalMs = (
    isMerchListing: boolean | null,
    rootCategoryBsr: number | null
) => {
    const policyBucket = getKeepaRefreshPolicyBucketKey(isMerchListing, rootCategoryBsr);
    switch (policyBucket) {
        case 'daily':
            return (rootCategoryBsr ?? Number.POSITIVE_INFINITY) < KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD
                ? KEEPA_TWICE_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS
                : KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS;
        case 'weekly':
            return KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS;
        case 'onDemand':
        case 'merchMissingBsr':
        case 'unknown':
        case 'nonMerch':
            return null;
    }
};

export const getKeepaRefreshDecision = ({
    isMerchListing,
    rootCategoryBsr,
    keepaFetchedAt,
    now = new Date(),
}: {
    isMerchListing: boolean | null;
    rootCategoryBsr: number | null;
    keepaFetchedAt: Date | null;
    now?: Date;
}) => {
    const refreshIntervalMs = getKeepaEnqueueMinRefreshIntervalMs(
        isMerchListing,
        rootCategoryBsr
    );
    if (refreshIntervalMs === null) {
        return { shouldRefresh: false, reason: 'not_eligible' } as const;
    }

    if (!keepaFetchedAt) {
        return { shouldRefresh: true, reason: 'never_fetched' } as const;
    }

    const staleBefore = now.getTime() - refreshIntervalMs;
    if (keepaFetchedAt.getTime() <= staleBefore) {
        return { shouldRefresh: true, reason: 'stale_product' } as const;
    }

    return { shouldRefresh: false, reason: 'fresh_product' } as const;
};

export const getKeepaFailureRetryDelayMs = (failureCount: number) => {
    const normalizedFailureCount = Math.max(1, Math.trunc(failureCount));
    return Math.min(
        KEEPA_FAILURE_RETRY_MAX_MS,
        KEEPA_FAILURE_RETRY_BASE_MS * 2 ** (normalizedFailureCount - 1)
    );
};
