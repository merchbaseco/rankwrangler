import type { ProductStats } from '@/db/product-stats';
import {
    KEEPA_REFRESH_POLICY_BUCKETS,
    type KeepaRefreshPolicyBucketKey,
} from '@/services/keepa-refresh-policy';
import {
    SPAPI_REFRESH_POLICY_BUCKETS,
    type SpApiRefreshPolicyBucketKey,
} from '@/services/spapi-refresh-policy';

export interface SpApiRefreshPolicyBucketStat {
    key: SpApiRefreshPolicyBucketKey | 'merchMissingBsr' | 'nonMerch';
    label: string;
    refreshEveryLabel: string;
    /** The long explanation the short label leaves out, shown on hover. */
    hint: string | null;
    count: number;
    isAutoRefresh: boolean;
}

export interface KeepaRefreshPolicyBucketStat {
    key: KeepaRefreshPolicyBucketKey;
    label: string;
    refreshEveryLabel: string;
    /** The long explanation the short label leaves out, shown on hover. */
    hint: string | null;
    count: number;
    /** Active Merch listings in this band eligible for auto-refresh but not yet admitted. */
    waiting: number;
    isAutoRefresh: boolean;
}

export const getSpApiRefreshPolicyBuckets = (
    stats: ProductStats
): SpApiRefreshPolicyBucketStat[] => {
    const countByKey: Record<SpApiRefreshPolicyBucketKey, number> = {
        '1mTo3m': stats.spApi1mTo3m,
        '200kTo500k': stats.spApi200kTo500k,
        '500kTo1m': stats.spApi500kTo1m,
        gte3m: stats.spApiGte3m,
        lt200k: stats.spApiLt200k,
    };

    return [
        ...SPAPI_REFRESH_POLICY_BUCKETS.map(bucket => ({
            key: bucket.key,
            label: bucket.label,
            refreshEveryLabel: bucket.refreshEveryLabel,
            hint: null,
            count: countByKey[bucket.key],
            isAutoRefresh: true,
        })),
        {
            key: 'merchMissingBsr',
            label: 'No BSR',
            refreshEveryLabel: 'Bounded',
            hint: 'Merch listings Amazon reports without a BSR get bounded checks.',
            count: stats.keepaMerchMissingBsr,
            isAutoRefresh: false,
        },
        {
            key: 'nonMerch',
            label: 'Non-Merch',
            refreshEveryLabel: 'Never',
            hint: 'Non-Merch listings are never refreshed.',
            count: stats.keepaNonMerch,
            isAutoRefresh: false,
        },
    ];
};

// Keepa's daily tier is every standing listing under 300k BSR, twice-daily ones included.
export const getKeepaRefreshPolicyBuckets = (
    stats: ProductStats
): KeepaRefreshPolicyBucketStat[] => {
    const countByKey: Record<KeepaRefreshPolicyBucketKey, number> = {
        daily: stats.historyTwiceDaily + stats.historyDaily,
        weekly: stats.historyWeekly,
        biweekly: stats.historyBiweekly,
        onDemand: stats.keepaOnDemand,
        merchMissingBsr: stats.keepaMerchMissingBsr,
        nonMerch: stats.keepaNonMerch,
    };
    const waitingByKey: Record<KeepaRefreshPolicyBucketKey, number> = {
        daily: stats.keepaWaitingDaily,
        weekly: stats.keepaWaitingWeekly,
        biweekly: stats.keepaWaitingBiweekly,
        onDemand: 0,
        merchMissingBsr: 0,
        nonMerch: 0,
    };

    return KEEPA_REFRESH_POLICY_BUCKETS.map(bucket => ({
        key: bucket.key,
        label: bucket.label,
        refreshEveryLabel: bucket.refreshEveryLabel,
        hint: bucket.hint,
        count: countByKey[bucket.key],
        waiting: waitingByKey[bucket.key],
        isAutoRefresh: bucket.isAutoRefresh,
    }));
};
