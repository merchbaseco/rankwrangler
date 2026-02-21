import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';

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

export type AdminStatsResponse = {
    stats: StatSeries[];
    bucketCount: number;
};

const BUCKET_COUNT = 30;

export const getAdminTimeSeries = async (): Promise<AdminStatsResponse> => {
    const [keepaBuckets, spApiJobBuckets] = await Promise.all([
        queryKeepaBuckets(),
        querySpApiJobBuckets(),
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
                label: 'Keepa Success',
                total: keepaSuccess,
                buckets: keepaBuckets.map((b) => b.success),
            },
            {
                label: 'Keepa Errors',
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
    };
};

const queryKeepaBuckets = async (): Promise<BucketRow[]> => {
    const rows = await db.execute<BucketRow>(sql`
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('minute', now() - interval '29 minutes'),
                date_trunc('minute', now()),
                interval '1 minute'
            ) AS bucket_start
        )
        SELECT
            b.bucket_start::text,
            coalesce(count(phi.id), 0)::int AS total,
            coalesce(count(phi.id) FILTER (WHERE phi.status = 'success'), 0)::int AS success,
            coalesce(count(phi.id) FILTER (WHERE phi.status = 'error'), 0)::int AS errors
        FROM buckets b
        LEFT JOIN product_history_imports phi
            ON phi.source = 'keepa'
            AND phi.created_at >= b.bucket_start
            AND phi.created_at < b.bucket_start + interval '1 minute'
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

const querySpApiJobBuckets = async (): Promise<BucketRow[]> => {
    const rows = await db.execute<BucketRow>(sql`
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('minute', now() - interval '29 minutes'),
                date_trunc('minute', now()),
                interval '1 minute'
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
            AND je.started_at < b.bucket_start + interval '1 minute'
            AND je.job_name = 'process-product-ingest-queue'
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
