import {
    buildAgentHistoryResponse,
    type HistoryMetricResult,
    type ProductHistoryFreshness,
} from '@/services/product-history-agent.js';
import { resolveAgentHistoryWindow } from '@/services/product-history-buckets.js';
import { buildLegacyHistoryResponse } from '@/services/product-history-legacy.js';

type ProductHistoryMetric = 'bsr' | 'price';
interface ProductHistorySurfaceInput {
    marketplaceId: string;
    asin: string;
    startAt?: Date;
    endAt?: Date;
    days: number;
    format: 'legacy' | 'agent';
    bucket: 'auto' | 'day' | 'week' | 'month';
}

type MetricEntry = readonly [ProductHistoryMetric, HistoryMetricResult];

export const buildMetricHistoryResponse = ({
    input,
    requestedMetrics,
    agentWindow,
    metricEntries,
    freshness,
}: {
    input: ProductHistorySurfaceInput;
    requestedMetrics: ProductHistoryMetric[];
    agentWindow: { startAt: Date; endAt: Date } | null;
    metricEntries: MetricEntry[];
    freshness: ProductHistoryFreshness;
}) => {
    const resultsByMetric = Object.fromEntries(metricEntries) as Partial<
        Record<ProductHistoryMetric, HistoryMetricResult>
    >;
    const primaryMetric = requestedMetrics.includes('bsr') ? 'bsr' : (requestedMetrics[0] ?? 'bsr');
    const primaryResult = resultsByMetric[primaryMetric];

    if (input.format === 'legacy') {
        const legacyResult = resultsByMetric.bsr;
        return buildLegacyHistoryResponse({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            latestImportAt: legacyResult?.latestImportAt ?? null,
            categoryNames: legacyResult?.categoryNames ?? {},
            points: legacyResult?.points ?? [],
            freshness,
        });
    }

    const emptyWindow = resolveAgentHistoryWindow({
        startAt: input.startAt,
        endAt: input.endAt,
        days: input.days,
    });
    return buildAgentHistoryResponse({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        requestedBucket: input.bucket,
        requestedMetrics,
        startAt: agentWindow?.startAt ?? emptyWindow.startAt,
        endAt: agentWindow?.endAt ?? emptyWindow.endAt,
        freshness,
        resultsByMetric: primaryResult ? resultsByMetric : {},
    });
};
