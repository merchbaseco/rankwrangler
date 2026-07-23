export const HISTORY_METRIC_ALIASES = ['bsr', 'price'] as const;
export const HISTORY_BUCKETS = ['auto', 'day', 'week', 'month'] as const;

export type HistoryMetricAlias = (typeof HISTORY_METRIC_ALIASES)[number];
export type HistoryBucket = (typeof HISTORY_BUCKETS)[number];
type HistoryBucketTuple = [string, number | null];

type HistoryBucketSummary = {
    first: number | null;
    latest: number | null;
    min: number | null;
    max: number | null;
    count: number;
    firstBucketAt: string | null;
    latestBucketAt: string | null;
};

export type AgentHistorySeries = {
    bsr?: {
        unit: 'rank';
        category: { id: number; name: string | null } | null;
        buckets: HistoryBucketTuple[];
        summary: HistoryBucketSummary;
    };
    price?: {
        unit: 'minorCurrency';
        currencyCode: 'USD';
        valueScale: 100;
        buckets: HistoryBucketTuple[];
        summary: HistoryBucketSummary;
    };
};

export type AgentHistoryResponse = {
    schemaVersion?: number;
    status?: string;
    syncTriggered: boolean;
    operation: {
        id: string;
        type: 'productHistoryRefresh';
        status: 'pending' | 'completed';
        retryAfterSeconds?: number;
        resource?: {
            type: 'productHistory';
            marketplaceId: string;
            asin: string;
        } | null;
        error?: {
            code: string;
            message: string;
        } | null;
    } | null;
    latestImportAt: string | null;
    range?: {
        startAt: string;
        endAt: string;
        bucket: Exclude<HistoryBucket, 'auto'>;
    };
    series?: AgentHistorySeries;
};

export const buildCliHistoryResponse = ({
    asin,
    marketplaceId,
    metrics,
    response,
}: {
    asin: string;
    marketplaceId: string;
    metrics: HistoryMetricAlias[];
    response: AgentHistoryResponse;
}) => {
    const series: AgentHistorySeries = {
        ...(metrics.includes('bsr') && response.series?.bsr ? { bsr: response.series.bsr } : {}),
        ...(metrics.includes('price') && response.series?.price
            ? { price: response.series.price }
            : {}),
    };
    const hasAnyBuckets = Object.values(series).some(metricSeries => metricSeries.buckets.length > 0);
    const status = normalizeHistoryStatus(response.status);

    return {
        schemaVersion: response.schemaVersion ?? 2,
        asin,
        marketplaceId,
        status: status ?? (response.syncTriggered ? 'collecting' : hasAnyBuckets ? 'ready' : 'empty'),
        latestImportAt: response.latestImportAt,
        syncTriggered: response.syncTriggered,
        operation: response.operation,
        ...(response.range ? { range: response.range } : {}),
        series,
    };
};

const normalizeHistoryStatus = (status: string | undefined) => {
    if (status === 'ready' || status === 'collecting' || status === 'empty') {
        return status;
    }

    return null;
};
