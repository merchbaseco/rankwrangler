import { sql } from 'drizzle-orm';
import {
    getKeepaRefreshPolicyBuckets,
    getSpApiRefreshPolicyBuckets,
    type KeepaRefreshPolicyBucketStat,
    type SpApiRefreshPolicyBucketStat,
} from '@/services/admin-refresh-policy-buckets.js';
import { db } from '@/db/index.js';
import { KEEPA_FETCH_SUCCESS_GUARD_LABEL } from '@/services/keepa-refresh-policy.js';

type BucketRow = {
    bucket_start: string;
    total: number;
    success: number;
    errors: number;
};

type StatSeries = {
    label: string;
    total: number;
    buckets: number[];
};

type KeepaMerchCoverageStats = {
    totalMerchProducts: number;
    merchProductsWithKeepaData: number;
    merchProductsWithoutKeepaData: number;
};

const KEEPA_JOB_NAMES = [
    'fetch-keepa-history-for-asin',
    'enqueue-scheduled-keepa-history-refresh',
] as const;

export type AdminStatsResponse = {
    stats: StatSeries[];
    bucketCount: number;
    timeDomainLabel: string;
    spApiRefreshPolicyBuckets: SpApiRefreshPolicyBucketStat[];
    keepaRefreshPolicyBuckets: KeepaRefreshPolicyBucketStat[];
    keepaFetchGuardLabel: string;
    keepaMerchCoverage: KeepaMerchCoverageStats;
};

const BUCKET_COUNT = 30;
const BUCKET_INTERVAL_MINUTES = 48;
const BUCKET_WINDOW_MINUTES = BUCKET_COUNT * BUCKET_INTERVAL_MINUTES;

export const getAdminTimeSeries = async (): Promise<AdminStatsResponse> => {
    const [
        keepaBuckets,
        spApiJobBuckets,
        spApiRefreshPolicyBuckets,
        keepaRefreshPolicyBuckets,
        keepaMerchCoverage,
    ] = await Promise.all([
        queryKeepaBuckets(),
        querySpApiJobBuckets(),
        getSpApiRefreshPolicyBuckets(),
        getKeepaRefreshPolicyBuckets(),
        queryKeepaMerchCoverage(),
    ]);

    const keepaTotal = sum(keepaBuckets.map((b) => b.total));
    const keepaSuccess = sum(keepaBuckets.map((b) => b.success));
    const keepaErrors = sum(keepaBuckets.map((b) => b.errors));
    const spApiJobTotal = sum(spApiJobBuckets.map((b) => b.total));
    const spApiJobSuccess = sum(spApiJobBuckets.map((b) => b.success));
    const spApiJobErrors = sum(spApiJobBuckets.map((b) => b.errors));

    return {
        stats: [
            {
                label: 'Keepa Fetches',
                total: keepaTotal,
                buckets: keepaBuckets.map((b) => b.total),
            },
            {
                label: 'Job Successes',
                total: keepaSuccess,
                buckets: keepaBuckets.map((b) => b.success),
            },
            {
                label: 'Job Failures',
                total: keepaErrors,
                buckets: keepaBuckets.map((b) => b.errors),
            },
            {
                label: 'SP-API Jobs Run',
                total: spApiJobTotal,
                buckets: spApiJobBuckets.map((b) => b.total),
            },
            {
                label: 'SP-API Jobs Success',
                total: spApiJobSuccess,
                buckets: spApiJobBuckets.map((b) => b.success),
            },
            {
                label: 'SP-API Jobs Failed',
                total: spApiJobErrors,
                buckets: spApiJobBuckets.map((b) => b.errors),
            },
        ],
        bucketCount: BUCKET_COUNT,
        timeDomainLabel: formatTimeDomainLabel(BUCKET_WINDOW_MINUTES),
        spApiRefreshPolicyBuckets,
        keepaRefreshPolicyBuckets,
        keepaFetchGuardLabel: KEEPA_FETCH_SUCCESS_GUARD_LABEL,
        keepaMerchCoverage,
    };
};

const queryKeepaBuckets = async (): Promise<BucketRow[]> => {
    const rows = await db.execute<BucketRow>(sql`
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('hour', now() - interval '23 hours'),
                date_trunc('hour', now()),
                interval '48 minutes'
            ) AS bucket_start
        ),
        keepa_imports AS (
            SELECT
                b.bucket_start,
                coalesce(count(phi.id), 0)::int AS total
            FROM buckets b
            LEFT JOIN product_history_imports phi
                ON phi.source = 'keepa'
                AND phi.created_at >= b.bucket_start
                AND phi.created_at < b.bucket_start + interval '48 minutes'
            GROUP BY b.bucket_start
        ),
        keepa_fetch_jobs AS (
            SELECT
                b.bucket_start,
                coalesce(count(je.id) FILTER (WHERE je.status = 'success'), 0)::int AS success,
                coalesce(count(je.id) FILTER (WHERE je.status = 'failed'), 0)::int AS errors
            FROM buckets b
            LEFT JOIN job_executions je
                ON je.job_name IN (
                    ${KEEPA_JOB_NAMES[0]},
                    ${KEEPA_JOB_NAMES[1]}
                )
                AND je.started_at >= b.bucket_start
                AND je.started_at < b.bucket_start + interval '48 minutes'
            GROUP BY b.bucket_start
        )
        SELECT
            b.bucket_start::text,
            coalesce(ki.total, 0)::int AS total,
            coalesce(kj.success, 0)::int AS success,
            coalesce(kj.errors, 0)::int AS errors
        FROM buckets b
        LEFT JOIN keepa_imports ki
            ON ki.bucket_start = b.bucket_start
        LEFT JOIN keepa_fetch_jobs kj
            ON kj.bucket_start = b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

const querySpApiJobBuckets = async (): Promise<BucketRow[]> => {
    const rows = await db.execute<BucketRow>(sql`
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('hour', now() - interval '23 hours'),
                date_trunc('hour', now()),
                interval '48 minutes'
            ) AS bucket_start
        )
        SELECT
            b.bucket_start::text,
            coalesce(count(je.id), 0)::int AS total,
            coalesce(count(je.id) FILTER (WHERE je.status = 'success'), 0)::int AS success,
            coalesce(count(je.id) FILTER (WHERE je.status = 'failed'), 0)::int AS errors
        FROM buckets b
        LEFT JOIN job_executions je
            ON je.started_at >= b.bucket_start
            AND je.started_at < b.bucket_start + interval '48 minutes'
            AND je.job_name = 'process-spapi-sync-queue'
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

type KeepaMerchCoverageRow = {
    total_merch_products: number;
    merch_products_with_keepa_data: number;
};

const queryKeepaMerchCoverage = async (): Promise<KeepaMerchCoverageStats> => {
    const rows = await db.execute<KeepaMerchCoverageRow>(sql`
        SELECT
            coalesce(
                count(*) FILTER (
                    WHERE p.is_merch_listing = true
                ),
                0
            )::int AS total_merch_products,
            coalesce(
                count(*) FILTER (
                    WHERE p.is_merch_listing = true
                    AND EXISTS (
                        SELECT 1
                        FROM product_history_imports phi
                        WHERE phi.product_id = p.id
                        AND phi.source = 'keepa'
                        AND phi.status = 'success'
                    )
                ),
                0
            )::int AS merch_products_with_keepa_data
        FROM products p
    `);

    const row = rows[0];
    const totalMerchProducts = row?.total_merch_products ?? 0;
    const merchProductsWithKeepaData = row?.merch_products_with_keepa_data ?? 0;

    return {
        totalMerchProducts,
        merchProductsWithKeepaData,
        merchProductsWithoutKeepaData: Math.max(
            totalMerchProducts - merchProductsWithKeepaData,
            0
        ),
    };
};

const formatTimeDomainLabel = (minutes: number) => {
    if (minutes % 60 === 0) {
        return `${minutes / 60}hr`;
    }

    return `${minutes}m`;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
