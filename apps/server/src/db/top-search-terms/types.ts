export const TOP_SEARCH_TERMS_REPORT_PERIODS = ['DAY', 'WEEK'] as const;

export type TopSearchTermsReportPeriod = (typeof TOP_SEARCH_TERMS_REPORT_PERIODS)[number];

export type TopSearchTermsWindow = {
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    dataStartDate: string;
    dataEndDate: string;
};

export type TopSearchTermsDatasetStatus =
    | 'idle'
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'failed';
