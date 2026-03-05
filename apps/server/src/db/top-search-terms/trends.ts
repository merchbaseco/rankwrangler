import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { topSearchTermsKeywordDaily } from '@/db/top-search-terms-schema.js';
import type { TopSearchTermsReportPeriod } from '@/db/top-search-terms/types.js';

export type TopSearchTermTrendPoint = {
    observedDate: string;
    searchFrequencyRank: number;
    clickShareTop3Sum: number;
    conversionShareTop3Sum: number;
};

export const listTopSearchTermTrendPoints = async ({
    marketplaceId,
    reportPeriod,
    searchTerm,
    observedDateFrom,
}: {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    searchTerm: string;
    observedDateFrom: string;
}): Promise<TopSearchTermTrendPoint[]> => {
    const rows = await db
        .select({
            observedDate: topSearchTermsKeywordDaily.observedDate,
            searchFrequencyRank: sql<number>`min(${topSearchTermsKeywordDaily.searchFrequencyRank})::int`,
            clickShareTop3SumBasisPoints:
                sql<number>`round(avg(${topSearchTermsKeywordDaily.clickShareTop3SumBasisPoints}))::int`,
            conversionShareTop3SumBasisPoints:
                sql<number>`round(avg(${topSearchTermsKeywordDaily.conversionShareTop3SumBasisPoints}))::int`,
        })
        .from(topSearchTermsKeywordDaily)
        .where(
            and(
                eq(topSearchTermsKeywordDaily.marketplaceId, marketplaceId),
                eq(topSearchTermsKeywordDaily.reportPeriod, reportPeriod),
                gte(topSearchTermsKeywordDaily.observedDate, observedDateFrom),
                sql`lower(${topSearchTermsKeywordDaily.searchTerm}) = lower(${searchTerm})`,
                eq(topSearchTermsKeywordDaily.isMerchRelevant, true)
            )
        )
        .groupBy(topSearchTermsKeywordDaily.observedDate)
        .orderBy(asc(topSearchTermsKeywordDaily.observedDate));

    return rows.map(row => ({
        observedDate: row.observedDate,
        searchFrequencyRank: row.searchFrequencyRank,
        clickShareTop3Sum: row.clickShareTop3SumBasisPoints / 10000,
        conversionShareTop3Sum: row.conversionShareTop3SumBasisPoints / 10000,
    }));
};

export const getLatestObservedDateForTopSearchTerm = async ({
    marketplaceId,
    reportPeriod,
    searchTerm,
}: {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    searchTerm: string;
}) => {
    const [row] = await db
        .select({
            observedDate: sql<string>`max(${topSearchTermsKeywordDaily.observedDate})`,
        })
        .from(topSearchTermsKeywordDaily)
        .where(
            and(
                eq(topSearchTermsKeywordDaily.marketplaceId, marketplaceId),
                eq(topSearchTermsKeywordDaily.reportPeriod, reportPeriod),
                sql`lower(${topSearchTermsKeywordDaily.searchTerm}) = lower(${searchTerm})`,
                eq(topSearchTermsKeywordDaily.isMerchRelevant, true)
            )
        )
        .limit(1);

    return row?.observedDate ?? null;
};
