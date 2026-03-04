import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { toUtcIsoTimestamp } from '@/services/utc-timestamp.js';

const TOP_SEARCH_TERMS_FETCH_JOB_NAMES = [
    'fetch-top-search-terms-dataset',
    'sync-top-search-terms-datasets',
] as const;

type TopSearchTermsStatusDatasetRow = {
    id: string;
    reportPeriod: 'DAY' | 'WEEK';
    dataStartDate: string;
    dataEndDate: string;
    status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed';
    refreshing: boolean;
    reportId: string | null;
    lastError: string | null;
    lastCompletedAt: string | null;
    lastFailedAt: string | null;
    nextRefreshAt: string | null;
    updatedAt: string;
    keywordCount: number | null;
    latestFetchedAt: string | null;
    latestObservedDate: string | null;
};

type TopSearchTermsStatusDatasetSqlRow = TopSearchTermsStatusDatasetRow;

type KeywordTotalsRow = {
    totalKeywordRows: number;
};

type KeywordBucketsRow = {
    total: number;
};

type JobBucketsRow = {
    success: number;
    errors: number;
};

export type TopSearchTermsStatusResponse = {
    stats: {
        totalTopSearchTerms: number;
        topSearchTermsBuckets: number[];
        jobSuccesses: number;
        jobSuccessBuckets: number[];
        jobFailures: number;
        jobFailureBuckets: number[];
        timeDomainLabel: string;
    };
    datasets: {
        daily: TopSearchTermsStatusDatasetRow[];
        weekly: TopSearchTermsStatusDatasetRow[];
    };
};

export const getTopSearchTermsStatus = async (): Promise<TopSearchTermsStatusResponse> => {
    const [keywordTotals, keywordBuckets, jobBuckets, dailyRows, weeklyRows] = await Promise.all([
        queryKeywordTotals(),
        queryKeywordBuckets(),
        queryJobBuckets(),
        queryDatasetsByPeriod('DAY', 120),
        queryDatasetsByPeriod('WEEK', 120),
    ]);

    return {
        stats: {
            totalTopSearchTerms: keywordTotals.totalKeywordRows,
            topSearchTermsBuckets: keywordBuckets.map((bucket) => bucket.total),
            jobSuccesses: sum(jobBuckets.map((bucket) => bucket.success)),
            jobSuccessBuckets: jobBuckets.map((bucket) => bucket.success),
            jobFailures: sum(jobBuckets.map((bucket) => bucket.errors)),
            jobFailureBuckets: jobBuckets.map((bucket) => bucket.errors),
            timeDomainLabel: formatTimeDomainLabel(BUCKET_WINDOW_MINUTES),
        },
        datasets: {
            daily: dailyRows,
            weekly: weeklyRows,
        },
    };
};

const queryKeywordTotals = async (): Promise<KeywordTotalsRow> => {
    const [row] = await db.execute<KeywordTotalsRow>(sql`
        SELECT count(*)::int AS "totalKeywordRows"
        FROM top_search_terms_keyword_daily
    `);

    return row ?? { totalKeywordRows: 0 };
};

const queryKeywordBuckets = async (): Promise<KeywordBucketsRow[]> => {
    const rows = await db.execute<KeywordBucketsRow>(sql`
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('hour', now() - interval '23 hours'),
                date_trunc('hour', now()),
                interval '48 minutes'
            ) AS bucket_start
        )
        SELECT
            coalesce(count(k.id), 0)::int AS total
        FROM buckets b
        LEFT JOIN top_search_terms_keyword_daily k
            ON k.created_at >= b.bucket_start
            AND k.created_at < b.bucket_start + interval '48 minutes'
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

const queryJobBuckets = async (): Promise<JobBucketsRow[]> => {
    const rows = await db.execute<JobBucketsRow>(sql`
        WITH buckets AS (
            SELECT generate_series(
                date_trunc('hour', now() - interval '23 hours'),
                date_trunc('hour', now()),
                interval '48 minutes'
            ) AS bucket_start
        )
        SELECT
            coalesce(count(je.id) FILTER (WHERE je.status = 'success'), 0)::int AS success,
            coalesce(count(je.id) FILTER (WHERE je.status = 'failed'), 0)::int AS errors
        FROM buckets b
        LEFT JOIN job_executions je
            ON je.started_at >= b.bucket_start
            AND je.started_at < b.bucket_start + interval '48 minutes'
            AND je.job_name IN (
                ${TOP_SEARCH_TERMS_FETCH_JOB_NAMES[0]},
                ${TOP_SEARCH_TERMS_FETCH_JOB_NAMES[1]}
            )
        GROUP BY b.bucket_start
        ORDER BY b.bucket_start
    `);

    return [...rows];
};

const queryDatasetsByPeriod = async (
    reportPeriod: 'DAY' | 'WEEK',
    limit: number
): Promise<TopSearchTermsStatusDatasetRow[]> => {
    const rows = await db.execute<TopSearchTermsStatusDatasetSqlRow>(sql`
        SELECT
            d.id,
            d.report_period AS "reportPeriod",
            d.data_start_date AS "dataStartDate",
            d.data_end_date AS "dataEndDate",
            d.status,
            d.refreshing,
            d.report_id AS "reportId",
            d.last_error AS "lastError",
            d.last_completed_at::text AS "lastCompletedAt",
            d.last_failed_at::text AS "lastFailedAt",
            d.next_refresh_at::text AS "nextRefreshAt",
            d.updated_at::text AS "updatedAt",
            ls.keyword_count::int AS "keywordCount",
            ls.fetched_at::text AS "latestFetchedAt",
            ls.observed_date AS "latestObservedDate"
        FROM top_search_terms_datasets d
        LEFT JOIN LATERAL (
            SELECT
                s.keyword_count,
                s.fetched_at,
                s.observed_date
            FROM top_search_terms_snapshots s
            WHERE s.dataset_id = d.id
            ORDER BY s.fetched_at DESC
            LIMIT 1
        ) ls ON true
        WHERE d.report_period = ${reportPeriod}
        ORDER BY d.data_end_date DESC
        LIMIT ${limit}
    `);

    return rows.map(normalizeDatasetRowTimestamps);
};

const normalizeDatasetRowTimestamps = (
    row: TopSearchTermsStatusDatasetSqlRow
): TopSearchTermsStatusDatasetRow => {
    return {
        ...row,
        lastCompletedAt: toUtcIsoTimestamp(row.lastCompletedAt),
        lastFailedAt: toUtcIsoTimestamp(row.lastFailedAt),
        nextRefreshAt: toUtcIsoTimestamp(row.nextRefreshAt),
        updatedAt: toUtcIsoTimestamp(row.updatedAt) ?? row.updatedAt,
        latestFetchedAt: toUtcIsoTimestamp(row.latestFetchedAt),
    };
};

const formatTimeDomainLabel = (minutes: number) => {
    if (minutes % 60 === 0) {
        return `${minutes / 60}hr`;
    }

    return `${minutes}m`;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

const BUCKET_COUNT = 30;
const BUCKET_INTERVAL_MINUTES = 48;
const BUCKET_WINDOW_MINUTES = BUCKET_COUNT * BUCKET_INTERVAL_MINUTES;
