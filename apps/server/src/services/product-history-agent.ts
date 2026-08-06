import type { PublicOperation } from '@/services/operations.js';
import {
    buildHistoryBuckets,
    type HistoryBucketSummary,
    type HistoryBucketTuple,
    type ProductHistoryBucket,
    type ResolvedHistoryBucket,
    resolveHistoryBucket,
    summarizeBuckets,
} from '@/services/product-history-buckets.js';

type ProductHistoryMetric = 'bsr' | 'price';

export interface ProductHistoryFreshness {
    stale: boolean;
    updatedAt: string | null;
}

interface AgentHistorySeries {
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
}

export interface AgentHistoryResponse {
    schemaVersion: 2;
    marketplaceId: string;
    asin: string;
    status: 'ready' | 'empty';
    freshness: ProductHistoryFreshness;
    range: { startAt: string; endAt: string; bucket: ResolvedHistoryBucket };
    series: AgentHistorySeries;
}

export interface OperationalAgentHistoryResponse
    extends Omit<AgentHistoryResponse, 'status' | 'freshness'> {
    status: 'collecting' | 'ready' | 'empty';
    latestImportAt: string | null;
    syncTriggered: boolean;
    operation: PublicOperation | null;
}

export interface HistoryPoint {
    categoryId: number;
    categoryName: string | null;
    observedAt: string;
    keepaMinutes: number;
    value: number | null;
    isMissing: boolean;
}

export interface HistoryMetricResult {
    latestImportAt: string | null;
    categoryNames: Record<string, string>;
    points: HistoryPoint[];
}

export const buildAgentHistoryResponse = ({
    marketplaceId,
    asin,
    requestedBucket,
    requestedMetrics,
    startAt,
    endAt,
    freshness,
    resultsByMetric,
}: {
    marketplaceId: string;
    asin: string;
    requestedBucket: ProductHistoryBucket;
    requestedMetrics: ProductHistoryMetric[];
    startAt: Date;
    endAt: Date;
    freshness: ProductHistoryFreshness;
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
        status: totalBucketCount > 0 ? 'ready' : 'empty',
        freshness,
        range: {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            bucket,
        },
        series,
    };
};

export const buildOperationalAgentHistoryResponse = ({
    collecting,
    syncTriggered,
    operation,
    resultsByMetric,
    ...input
}: Omit<Parameters<typeof buildAgentHistoryResponse>[0], 'freshness'> & {
    collecting: boolean;
    syncTriggered: boolean;
    operation: PublicOperation | null;
}): OperationalAgentHistoryResponse => {
    const latestImportAt = resolveLatestImportAt(
        Object.values(resultsByMetric).map(result => result.latestImportAt)
    );
    const response = buildAgentHistoryResponse({
        ...input,
        resultsByMetric,
        freshness: { stale: !latestImportAt, updatedAt: latestImportAt },
    });
    const { freshness: _freshness, ...history } = response;

    return {
        ...history,
        status: collecting ? 'collecting' : response.status,
        latestImportAt,
        syncTriggered,
        operation,
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
        if (
            Number.isFinite(candidateDate.getTime()) &&
            (!latestDate || candidateDate > latestDate)
        ) {
            latestDate = candidateDate;
        }
    }

    return latestDate?.toISOString() ?? null;
};
