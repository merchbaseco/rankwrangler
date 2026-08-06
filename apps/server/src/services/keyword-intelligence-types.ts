import type {
    TopSearchTermsRefreshTrigger,
    TopSearchTermsReportPeriod,
} from '@/db/top-search-terms/types.js';
import type { SearchTermsTrendDeltas } from '@/services/top-search-terms-trend.js';

export const KEYWORD_DEFAULT_REPORT_PERIOD = 'DAY' as const;
export const KEYWORD_DEFAULT_LIMIT = 25;
export const KEYWORD_MAX_LIMIT = 100;
export const KEYWORD_DEFAULT_HISTORY_DAYS = 90;

export interface KeywordFreshness {
    stale: boolean;
    updatedAt: string | null;
}

export interface KeywordEvidence {
    searchFrequencyRank: number;
    clickShareTop3: number;
    conversionShareTop3: number;
    topRowsCount: number;
    isMerchRelevant: boolean;
    merchReason: string;
}

export interface KeywordCurrent {
    keyword: string;
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    dataStartDate: string;
    dataEndDate: string;
    observedDate: string;
    fetchedAt: string;
    trigger: TopSearchTermsRefreshTrigger;
    evidence: KeywordEvidence;
}

export interface KeywordSearchItem extends KeywordEvidence {
    keyword: string;
    observedDate: string;
    trigger: TopSearchTermsRefreshTrigger;
}

export interface KeywordSearchSummary {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    dataStartDate: string | null;
    dataEndDate: string | null;
    observedDate: string | null;
    fetchedAt: string | null;
    totalFiltered: number;
}

export interface KeywordSearchResponse {
    status: 'ready' | 'empty';
    items: KeywordSearchItem[];
    nextCursor: number | null;
    summary: KeywordSearchSummary;
    freshness: KeywordFreshness;
}

export interface KeywordHistoryPoint {
    observedDate: string;
    searchFrequencyRank: number;
    clickShareTop3: number;
    conversionShareTop3: number;
    trigger: TopSearchTermsRefreshTrigger;
}

export interface KeywordHistoryResponse {
    keyword: string;
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    rangeDays: number;
    status: 'ready' | 'empty';
    latestObservedDate: string | null;
    points: KeywordHistoryPoint[];
    deltas: SearchTermsTrendDeltas;
    freshness: KeywordFreshness;
}
