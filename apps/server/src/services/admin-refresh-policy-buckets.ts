import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_REFRESH_POLICY_BUCKETS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    type KeepaRefreshPolicyBucketKey,
} from '@/services/keepa-refresh-policy.js';
import {
    BSR_THRESHOLD_1M,
    BSR_THRESHOLD_200K,
    BSR_THRESHOLD_3M,
    BSR_THRESHOLD_500K,
    SPAPI_REFRESH_POLICY_BUCKETS,
    type SpApiRefreshPolicyBucketKey,
} from '@/services/spapi-refresh-policy.js';

type SpApiRefreshPolicyCountRow = {
    lt_200k: number;
    range_200k_500k: number;
    range_500k_1m: number;
    range_1m_3m: number;
    gte_3m: number;
    non_auto_refresh: number;
};

type KeepaRefreshPolicyCountRow = {
    daily: number;
    weekly: number;
    on_demand: number;
    merch_missing_bsr: number;
    non_merch: number;
};

export type SpApiRefreshPolicyBucketStat = {
    key: SpApiRefreshPolicyBucketKey | 'nonAutoRefresh';
    label: string;
    refreshEveryLabel: string;
    count: number;
    isAutoRefresh: boolean;
};

export type KeepaRefreshPolicyBucketStat = {
    key: KeepaRefreshPolicyBucketKey;
    label: string;
    refreshEveryLabel: string;
    count: number;
    isAutoRefresh: boolean;
};

export const getSpApiRefreshPolicyBuckets = async (): Promise<SpApiRefreshPolicyBucketStat[]> => {
    const counts = await querySpApiRefreshPolicyBucketCounts();
    const countByKey: Record<SpApiRefreshPolicyBucketKey, number> = {
        '1mTo3m': counts.range_1m_3m,
        '200kTo500k': counts.range_200k_500k,
        '500kTo1m': counts.range_500k_1m,
        gte3m: counts.gte_3m,
        lt200k: counts.lt_200k,
    };

    return [
        ...SPAPI_REFRESH_POLICY_BUCKETS.map((bucket) => ({
            key: bucket.key,
            label: bucket.label,
            refreshEveryLabel: bucket.refreshEveryLabel,
            count: countByKey[bucket.key],
            isAutoRefresh: true,
        })),
        {
            key: 'nonAutoRefresh',
            label: 'Non-merch or missing BSR',
            refreshEveryLabel: 'No automatic refresh',
            count: counts.non_auto_refresh,
            isAutoRefresh: false,
        },
    ];
};

export const getKeepaRefreshPolicyBuckets = async (): Promise<KeepaRefreshPolicyBucketStat[]> => {
    const counts = await queryKeepaRefreshPolicyBucketCounts();
    const countByKey: Record<KeepaRefreshPolicyBucketKey, number> = {
        daily: counts.daily,
        weekly: counts.weekly,
        onDemand: counts.on_demand,
        merchMissingBsr: counts.merch_missing_bsr,
        nonMerch: counts.non_merch,
    };

    return KEEPA_REFRESH_POLICY_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        refreshEveryLabel: bucket.refreshEveryLabel,
        count: countByKey[bucket.key],
        isAutoRefresh: bucket.isAutoRefresh,
    }));
};

const querySpApiRefreshPolicyBucketCounts = async (): Promise<SpApiRefreshPolicyCountRow> => {
    const rows = await db.execute<SpApiRefreshPolicyCountRow>(sql`
        SELECT
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr < ${BSR_THRESHOLD_200K}
                ),
                0
            )::int AS lt_200k,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr >= ${BSR_THRESHOLD_200K}
                    AND root_category_bsr < ${BSR_THRESHOLD_500K}
                ),
                0
            )::int AS range_200k_500k,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr >= ${BSR_THRESHOLD_500K}
                    AND root_category_bsr < ${BSR_THRESHOLD_1M}
                ),
                0
            )::int AS range_500k_1m,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr >= ${BSR_THRESHOLD_1M}
                    AND root_category_bsr < ${BSR_THRESHOLD_3M}
                ),
                0
            )::int AS range_1m_3m,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr >= ${BSR_THRESHOLD_3M}
                ),
                0
            )::int AS gte_3m,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = false
                    OR root_category_bsr IS NULL
                ),
                0
            )::int AS non_auto_refresh
        FROM products
    `);

    const [row] = rows;
    return (
        row ?? {
            gte_3m: 0,
            lt_200k: 0,
            non_auto_refresh: 0,
            range_1m_3m: 0,
            range_200k_500k: 0,
            range_500k_1m: 0,
        }
    );
};

const queryKeepaRefreshPolicyBucketCounts = async (): Promise<KeepaRefreshPolicyCountRow> => {
    const rows = await db.execute<KeepaRefreshPolicyCountRow>(sql`
        SELECT
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                ),
                0
            )::int AS daily,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr >= ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                    AND root_category_bsr < ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}
                ),
                0
            )::int AS weekly,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NOT NULL
                    AND root_category_bsr >= ${KEEPA_WEEKLY_AUTO_BSR_THRESHOLD}
                ),
                0
            )::int AS on_demand,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = true
                    AND root_category_bsr IS NULL
                ),
                0
            )::int AS merch_missing_bsr,
            coalesce(
                count(*) FILTER (
                    WHERE is_merch_listing = false
                ),
                0
            )::int AS non_merch
        FROM products
    `);

    const [row] = rows;
    return (
        row ?? {
            daily: 0,
            weekly: 0,
            on_demand: 0,
            merch_missing_bsr: 0,
            non_merch: 0,
        }
    );
};
