export const HISTORY_METRIC_ALIASES = ['salesRank', 'price'] as const;
export const HISTORY_BUCKETS = ['auto', 'day', 'week', 'month'] as const;

export type HistoryMetricAlias = (typeof HISTORY_METRIC_ALIASES)[number];
export type HistoryBucket = (typeof HISTORY_BUCKETS)[number];
