const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const KEEPA_DAILY_AUTO_BSR_THRESHOLD = 300000;
export const KEEPA_WEEKLY_AUTO_BSR_THRESHOLD = 1000000;
export const KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = DAY_IN_MS;
export const KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS = 7 * DAY_IN_MS;
export const KEEPA_ON_DEMAND_ENQUEUE_MIN_REFRESH_INTERVAL_MS = DAY_IN_MS;
export const KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS = DAY_IN_MS;
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
        key: 'nonMerch',
        label: 'Non-Merch',
        refreshEveryLabel: 'No Keepa sync',
        isAutoRefresh: false,
    },
] as const satisfies readonly KeepaRefreshPolicyBucket[];

export type KeepaRefreshPolicyBucketKey = (typeof KEEPA_REFRESH_POLICY_BUCKETS)[number]['key'];

export const getKeepaRefreshPolicyBucketKey = (
    isMerchListing: boolean,
    rootCategoryBsr: number | null
) => {
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
    isMerchListing: boolean,
    rootCategoryBsr: number | null
) => {
    const policyBucket = getKeepaRefreshPolicyBucketKey(isMerchListing, rootCategoryBsr);
    return policyBucket === 'daily' || policyBucket === 'weekly' || policyBucket === 'onDemand';
};

export const getKeepaEnqueueMinRefreshIntervalMs = (
    isMerchListing: boolean,
    rootCategoryBsr: number | null
) => {
    const policyBucket = getKeepaRefreshPolicyBucketKey(isMerchListing, rootCategoryBsr);
    switch (policyBucket) {
        case 'daily':
            return KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS;
        case 'weekly':
            return KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS;
        case 'onDemand':
            return KEEPA_ON_DEMAND_ENQUEUE_MIN_REFRESH_INTERVAL_MS;
        case 'merchMissingBsr':
        case 'nonMerch':
            return null;
    }
};
