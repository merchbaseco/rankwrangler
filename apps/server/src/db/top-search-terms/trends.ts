import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import type {
    TopSearchTermsRefreshTrigger,
    TopSearchTermsReportPeriod,
} from '@/db/top-search-terms/types.js';
import {
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
} from '@/db/top-search-terms-schema.js';

export interface TopSearchTermTrendPoint {
    observedDate: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
    trigger: TopSearchTermsRefreshTrigger;
}

type TopSearchTermTrendQueryRow = Record<string, unknown> & {
    latestObservedDate: string;
    observedDate: string;
    searchFrequencyRank: number;
    clickShareTop3SumBasisPoints: number;
    conversionShareTop3SumBasisPoints: number;
    trigger?: string;
};

export const getTopSearchTermTrend = async ({
    marketplaceId,
    reportPeriod,
    searchTerm,
    rangeDays,
}: {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    searchTerm: string;
    rangeDays: number;
}) => {
    const windowSizeDays = Math.max(0, Math.floor(rangeDays) - 1);
    const rows = await db.execute<TopSearchTermTrendQueryRow>(sql`
        WITH latest AS (
            SELECT max(${topSearchTermsKeywordDaily.observedDate}) AS latest_observed_date
            FROM ${topSearchTermsKeywordDaily}
            WHERE ${topSearchTermsKeywordDaily.marketplaceId} = ${marketplaceId}
                AND ${topSearchTermsKeywordDaily.reportPeriod} = ${reportPeriod}
                AND lower(${topSearchTermsKeywordDaily.searchTerm}) = lower(${searchTerm})
                AND ${topSearchTermsKeywordDaily.isMerchRelevant} = true
        )
        SELECT
            latest.latest_observed_date AS "latestObservedDate",
            keyword.observed_date AS "observedDate",
            min(keyword.search_frequency_rank)::int AS "searchFrequencyRank",
            round(avg(keyword.click_share_top3_sum_basis_points))::int AS "clickShareTop3SumBasisPoints",
            round(avg(keyword.conversion_share_top3_sum_basis_points))::int AS "conversionShareTop3SumBasisPoints",
            (array_agg(snapshot.trigger ORDER BY snapshot.fetched_at DESC))[1] AS trigger
        FROM latest
        JOIN ${topSearchTermsKeywordDaily} AS keyword
            ON latest.latest_observed_date IS NOT NULL
        JOIN ${topSearchTermsSnapshots} AS snapshot
            ON snapshot.id = keyword.snapshot_id
        WHERE keyword.marketplace_id = ${marketplaceId}
            AND keyword.report_period = ${reportPeriod}
            AND lower(keyword.search_term) = lower(${searchTerm})
            AND keyword.is_merch_relevant = true
            AND keyword.observed_date >= to_char(
                (
                    latest.latest_observed_date::date
                    - ${windowSizeDays} * INTERVAL '1 day'
                )::date,
                'YYYY-MM-DD'
            )
        GROUP BY latest.latest_observed_date, keyword.observed_date
        ORDER BY keyword.observed_date ASC
    `);

    return mapTopSearchTermTrendRows(rows);
};

export const mapTopSearchTermTrendRows = (rows: TopSearchTermTrendQueryRow[]) => {
    const latestObservedDate = rows[0]?.latestObservedDate ?? null;

    return {
        latestObservedDate,
        points: rows.map(row => ({
            observedDate: row.observedDate,
            searchFrequencyRank: row.searchFrequencyRank,
            clickShareTop3Sum: row.clickShareTop3SumBasisPoints / 10_000,
            conversionShareTop3Sum: row.conversionShareTop3SumBasisPoints / 10_000,
            trigger: normalizeRefreshTrigger(row.trigger),
        })),
    };
};

const normalizeRefreshTrigger = (value?: string): TopSearchTermsRefreshTrigger =>
    value === 'requested' ? 'requested' : 'automatic';
