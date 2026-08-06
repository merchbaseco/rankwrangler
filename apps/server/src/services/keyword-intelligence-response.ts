import type {
    TopSearchTermsKeywordListRow,
    TopSearchTermsSnapshotRecord,
} from '@/db/top-search-terms/snapshots.js';
import type { TopSearchTermsReportPeriod } from '@/db/top-search-terms/types.js';
import type {
    KeywordCurrent,
    KeywordEvidence,
    KeywordSearchItem,
    KeywordSearchSummary,
} from '@/services/keyword-intelligence-types.js';

export const mapCurrentKeyword = (
    snapshot: TopSearchTermsSnapshotRecord,
    row: TopSearchTermsKeywordListRow
): KeywordCurrent => ({
    keyword: row.searchTerm,
    marketplaceId: snapshot.marketplaceId,
    reportPeriod: snapshot.reportPeriod as TopSearchTermsReportPeriod,
    dataStartDate: snapshot.dataStartDate,
    dataEndDate: snapshot.dataEndDate,
    observedDate: snapshot.observedDate,
    fetchedAt: snapshot.fetchedAt,
    trigger: snapshot.trigger,
    evidence: mapEvidence(row),
});

export const mapSearchResult = (
    snapshot: TopSearchTermsSnapshotRecord,
    row: TopSearchTermsKeywordListRow
): KeywordSearchItem => ({
    keyword: row.searchTerm,
    observedDate: snapshot.observedDate,
    trigger: snapshot.trigger,
    ...mapEvidence(row),
});

export const buildEmptyKeywordSearchSummary = (input: {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
}): KeywordSearchSummary => ({
    marketplaceId: input.marketplaceId,
    reportPeriod: input.reportPeriod,
    dataStartDate: null,
    dataEndDate: null,
    observedDate: null,
    fetchedAt: null,
    totalFiltered: 0,
});

export const buildKeywordDatasetSummary = (
    snapshot: TopSearchTermsSnapshotRecord,
    counts: { totalFiltered: number }
): KeywordSearchSummary => ({
    marketplaceId: snapshot.marketplaceId,
    reportPeriod: snapshot.reportPeriod as TopSearchTermsReportPeriod,
    dataStartDate: snapshot.dataStartDate,
    dataEndDate: snapshot.dataEndDate,
    observedDate: snapshot.observedDate,
    fetchedAt: snapshot.fetchedAt,
    totalFiltered: counts.totalFiltered,
});

const mapEvidence = (row: TopSearchTermsKeywordListRow): KeywordEvidence => ({
    searchFrequencyRank: row.searchFrequencyRank,
    clickShareTop3: row.clickShareTop3Sum,
    conversionShareTop3: row.conversionShareTop3Sum,
    topRowsCount: row.topRowsCount,
    isMerchRelevant: row.isMerchRelevant,
    merchReason: row.merchReason,
});
