import {
    buildHistoryBuckets,
    productHistoryBuckets,
    resolveAgentHistoryWindow,
    resolveHistoryBucket,
    summarizeBuckets,
    type HistoryBucketSummary,
    type HistoryBucketTuple,
    type ProductHistoryBucket,
    type ResolvedHistoryBucket,
} from '@/services/product-history-buckets.js';
import type { PublicOperation } from '@/services/operations.js';

export { productHistoryBuckets, resolveAgentHistoryWindow };
export type { ProductHistoryBucket };

type ProductHistoryMetric = 'bsr' | 'price';

type AgentHistorySeries = {
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
    schemaVersion: 2;
    marketplaceId: string;
    asin: string;
    status: 'collecting' | 'ready' | 'empty';
    latestImportAt: string | null;
    syncTriggered: boolean;
    operation: PublicOperation | null;
    range: { startAt: string; endAt: string; bucket: ResolvedHistoryBucket };
    series: AgentHistorySeries;
};

type HistoryPoint = {
    categoryId: number;
    categoryName: string | null;
    observedAt: string;
    keepaMinutes: number;
    value: number | null;
    isMissing: boolean;
};

export type HistoryMetricResult = {
    latestImportAt: string | null;
    categoryNames: Record<string, string>;
    points: HistoryPoint[];
};

export const buildAgentHistoryResponse = ({
    marketplaceId,
    asin,
    requestedBucket,
    requestedMetrics,
    startAt,
    endAt,
    collecting,
    syncTriggered,
    operation,
    resultsByMetric,
}: {
    marketplaceId: string;
    asin: string;
    requestedBucket: ProductHistoryBucket;
    requestedMetrics: ProductHistoryMetric[];
    startAt: Date;
    endAt: Date;
    collecting: boolean;
    syncTriggered: boolean;
    operation: PublicOperation | null;
    resultsByMetric: Partial<Record<ProductHistoryMetric, HistoryMetricResult>>;
}): AgentHistoryResponse => {
    const bucket = resolveHistoryBucket({ requestedBucket, startAt, endAt });
    const series: AgentHistorySeries = {};

    if (requestedMetrics.includes('bsr') && resultsByMetric.bsr) {
        series.bsr = buildBsrSeries(resultsByMetric.bsr, bucket, startAt, endAt);
    }

    if (requestedMetrics.includes('price') && resultsByMetric.price) {
        series.price = buildPriceSeries(resultsByMetric.price, bucket, startAt, endAt);
    }

    const totalBucketCount = Object.values(series).reduce(
        (total, metricSeries) => total + metricSeries.buckets.length,
        0
    );

    return {
        schemaVersion: 2 as const,
        marketplaceId,
        asin,
        status: collecting ? ('collecting' as const) : totalBucketCount > 0 ? 'ready' : 'empty',
        latestImportAt: resolveLatestImportAt(
            Object.values(resultsByMetric).map(result => result.latestImportAt)
        ),
        syncTriggered,
        operation,
        range: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            bucket,
        },
        series,
    };
};

const buildBsrSeries = (
    result: HistoryMetricResult,
    bucket: ResolvedHistoryBucket,
    startAt: Date,
    endAt: Date
): NonNullable<AgentHistorySeries['bsr']> => {
    const buckets = buildHistoryBuckets({ points: result.points, bucket, startAt, endAt });
    return {
        unit: 'rank' as const,
        category: resolveBsrCategory(result),
        buckets,
        summary: summarizeBuckets(buckets),
    };
};

const buildPriceSeries = (
    result: HistoryMetricResult,
    bucket: ResolvedHistoryBucket,
    startAt: Date,
    endAt: Date
): NonNullable<AgentHistorySeries['price']> => {
    const buckets = buildHistoryBuckets({ points: result.points, bucket, startAt, endAt });
    return {
        unit: 'minorCurrency' as const,
        currencyCode: 'USD' as const,
        valueScale: 100 as const,
        buckets,
        summary: summarizeBuckets(buckets),
    };
};

const resolveBsrCategory = (result: HistoryMetricResult) => {
    for (let index = result.points.length - 1; index >= 0; index -= 1) {
        const point = result.points[index];
        if (point.categoryId <= 0) {
            continue;
        }

        return {
            id: point.categoryId,
            name: point.categoryName ?? result.categoryNames[String(point.categoryId)] ?? null,
        };
    }

    return null;
};

const resolveLatestImportAt = (latestImportValues: Array<string | null>) => {
    let latestDate: Date | null = null;

    for (const value of latestImportValues) {
        if (!value) {
            continue;
        }

        const candidateDate = new Date(value);
        if (!Number.isFinite(candidateDate.getTime())) {
            continue;
        }

        if (!latestDate || candidateDate > latestDate) {
            latestDate = candidateDate;
        }
    }

    return latestDate ? latestDate.toISOString() : null;
};
