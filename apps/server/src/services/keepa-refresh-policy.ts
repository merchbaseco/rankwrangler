const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MINUTE_IN_MS = 60 * 1000;

export const KEEPA_DAILY_AUTO_BSR_THRESHOLD = 300000;
export const KEEPA_WEEKLY_AUTO_BSR_THRESHOLD = 1000000;
export const KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = DAY_IN_MS;
export const KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = 7 * DAY_IN_MS;
export const KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS = DAY_IN_MS;
export const KEEPA_FAILURE_RETRY_BASE_MS = 5 * MINUTE_IN_MS;
export const KEEPA_FAILURE_RETRY_MAX_MS = DAY_IN_MS;
export const KEEPA_FETCH_SUCCESS_GUARD_LABEL =
    'Global fetch guard: never invoke Keepa more than once per ASIN every 24h';

type KeepaRefreshPolicyBucket = {
    key: string;
    label: string;
    refreshEveryLabel: string;
    isAutoRefresh: boolean;
};

export const KEEPA_REFRESH_POLICY_BUCKETS = [
    {
        key: 'daily',
        label: 'Merch BSR <300k',
        refreshEveryLabel: 'Automatic daily sync',
        isAutoRefresh: true,
    },
    {
        key: 'weekly',
        label: 'Merch BSR 300k to <1M',
        refreshEveryLabel: 'Automatic weekly sync',
        isAutoRefresh: true,
    },
    {
        key: 'onDemand',
        label: 'Merch BSR >=1M',
        refreshEveryLabel: 'Sync on demand',
        isAutoRefresh: false,
    },
    {
        key: 'merchMissingBsr',
        label: 'Merch Missing BSR',
        refreshEveryLabel: 'No Keepa sync',
        isAutoRefresh: false,
    },
    {
        key: 'unknown',
        label: 'Classification Unknown',
        refreshEveryLabel: 'No Keepa sync',
        isAutoRefresh: false,
    },
    {
        key: 'nonMerch',
        label: 'Non-Merch',
        refreshEveryLabel: 'No Keepa sync',
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
            return KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS;
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
