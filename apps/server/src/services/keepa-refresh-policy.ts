export const KEEPA_AUTO_BSR_THRESHOLD = 1000000;
export const KEEPA_QUEUE_ENQUEUE_MIN_REFRESH_INTERVAL_MS = 48 * 60 * 60 * 1000;
export const KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const KEEPA_QUEUE_ENQUEUE_MIN_REFRESH_INTERVAL_LABEL =
    'Minimum 48h between auto-enqueue checks';
export const KEEPA_FETCH_SUCCESS_GUARD_LABEL =
    'Global fetch guard: one successful Keepa fetch per ASIN every 24h';

type KeepaRefreshPolicyBucket = {
    key: string;
    label: string;
    refreshEveryLabel: string;
    isAutoRefresh: boolean;
};

export const KEEPA_REFRESH_POLICY_BUCKETS = [
    {
        key: 'eligible',
        label: 'Merch BSR <1M',
        refreshEveryLabel: `Event-driven enqueue (${KEEPA_QUEUE_ENQUEUE_MIN_REFRESH_INTERVAL_LABEL})`,
        isAutoRefresh: true,
    },
    {
        key: 'merchIneligible',
        label: 'Merch BSR >=1M or missing BSR',
        refreshEveryLabel: 'No automatic enqueue',
        isAutoRefresh: false,
    },
    {
        key: 'nonMerch',
        label: 'Non-Merch',
        refreshEveryLabel: 'No automatic enqueue',
        isAutoRefresh: false,
    },
] as const satisfies readonly KeepaRefreshPolicyBucket[];

export type KeepaRefreshPolicyBucketKey = (typeof KEEPA_REFRESH_POLICY_BUCKETS)[number]['key'];

export const isEligibleForKeepaAutoRefresh = (
    isMerchListing: boolean,
    rootCategoryBsr: number | null
) => {
    if (!isMerchListing) {
        return false;
    }

    if (typeof rootCategoryBsr !== 'number' || !Number.isFinite(rootCategoryBsr)) {
        return false;
    }

    return rootCategoryBsr < KEEPA_AUTO_BSR_THRESHOLD;
};
