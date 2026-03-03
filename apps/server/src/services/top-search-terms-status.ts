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

type JobTotalsRow = {
    successCount: number;
    failedCount: number;
};

type KeywordTotalsRow = {
    totalKeywordRows: number;
};

export type TopSearchTermsStatusResponse = {
    stats: {
        totalTopSearchTerms: number;
        jobSuccesses: number;
        jobFailures: number;
    };
    datasets: {
        daily: TopSearchTermsStatusDatasetRow[];
        weekly: TopSearchTermsStatusDatasetRow[];
    };
};

export const getTopSearchTermsStatus = async (): Promise<TopSearchTermsStatusResponse> => {
    const [keywordTotals, jobTotals, dailyRows, weeklyRows] = await Promise.all([
        queryKeywordTotals(),
        queryJobTotals(),
        queryDatasetsByPeriod('DAY', 120),
        queryDatasetsByPeriod('WEEK', 120),
    ]);

    return {
        stats: {
            totalTopSearchTerms: keywordTotals.totalKeywordRows,
            jobSuccesses: jobTotals.successCount,
            jobFailures: jobTotals.failedCount,
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

const queryJobTotals = async (): Promise<JobTotalsRow> => {
    const [row] = await db.execute<JobTotalsRow>(sql`
        SELECT
            coalesce(count(*) FILTER (WHERE status = 'success'), 0)::int AS "successCount",
            coalesce(count(*) FILTER (WHERE status = 'failed'), 0)::int AS "failedCount"
        FROM job_executions
        WHERE job_name IN (
            ${TOP_SEARCH_TERMS_FETCH_JOB_NAMES[0]},
            ${TOP_SEARCH_TERMS_FETCH_JOB_NAMES[1]}
        )
    `);

    return row ?? { successCount: 0, failedCount: 0 };
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
