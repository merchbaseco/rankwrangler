export const HISTORY_METRIC_ALIASES = ['bsr', 'price'] as const;

export type HistoryMetricAlias = (typeof HISTORY_METRIC_ALIASES)[number];
type HistoryPointTuple = [string, number | null] | [string, null, 1];

export type AgentHistorySeries = {
    bsr?: {
        unit: 'rank';
        category: { id: number; name: string | null } | null;
        points: HistoryPointTuple[];
    };
    price?: {
        unit: 'minorCurrency';
        currencyCode: 'USD';
        valueScale: 100;
        points: HistoryPointTuple[];
    };
};

export type AgentHistoryResponse = {
    schemaVersion?: number;
    status?: string;
    syncTriggered: boolean;
    latestImportAt: string | null;
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
    const hasAnyPoints = Object.values(series).some(metricSeries => metricSeries.points.length > 0);
    const status = normalizeHistoryStatus(response.status);

    return {
        schemaVersion: response.schemaVersion ?? 1,
        asin,
        marketplaceId,
        status: status ?? (response.syncTriggered ? 'collecting' : hasAnyPoints ? 'ready' : 'empty'),
        latestImportAt: response.latestImportAt,
        syncTriggered: response.syncTriggered,
        series,
    };
};

const normalizeHistoryStatus = (status: string | undefined) => {
    if (status === 'ready' || status === 'collecting' || status === 'empty') {
        return status;
    }

    return null;
};
