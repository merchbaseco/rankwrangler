export type HistoryChartPoint = {
    timestamp: number;
    value: number;
};

export type HistoryChartRawPoint = {
    isMissing: boolean;
    value: number | null;
    observedAt: string;
};

export type HistoryChartTimeDomain = {
    startAt: number;
    endAt: number;
};

export const AMAZON_US_TIME_ZONE = 'America/Los_Angeles';

export const HISTORY_RANGE_PRESETS = [
    { key: '30d', shortLabel: '30D', dashboardLabel: '30 days', days: 30 },
    { key: '90d', shortLabel: '90D', dashboardLabel: '90 days', days: 90 },
    { key: '6m', shortLabel: '6M', dashboardLabel: '6 months', days: 180 },
    { key: '1y', shortLabel: '1Y', dashboardLabel: '1 year', days: 365 },
    { key: 'all', shortLabel: 'ALL', dashboardLabel: 'All time', days: null },
] as const;

export type HistoryRangePresetKey = (typeof HISTORY_RANGE_PRESETS)[number]['key'];
