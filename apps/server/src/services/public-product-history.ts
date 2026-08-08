import type { AgentHistoryResponse } from './product-history-agent';
import {
    getProductHistorySurface,
    type ProductHistorySurfaceInput,
} from './product-history-surface';

export const publicProductHistoryMetrics = ['salesRank', 'price'] as const;
export type PublicProductHistoryMetric = (typeof publicProductHistoryMetrics)[number];

export interface PublicProductHistoryInput {
    marketplaceId: string;
    asin: string;
    metrics: PublicProductHistoryMetric[];
    bucket: 'auto' | 'day' | 'week' | 'month';
    days: number;
    limit: number;
    startAt?: Date;
    endAt?: Date;
    ownerMerchbaseUserId: string;
    signal?: AbortSignal;
}

export interface ProductHistorySummary {
    first: number | null;
    latest: number | null;
    min: number | null;
    max: number | null;
}

export interface PublicProductHistory {
    marketplaceId: string;
    asin: string;
    range: {
        startAt: string;
        endAt: string;
        interval: 'day' | 'week' | 'month';
    };
    series: {
        salesRank?: {
            unit: 'rank';
            category: { id: number; name: string | null } | null;
            points: [periodStart: string, valueAtPeriodEnd: number | null][];
            summary: ProductHistorySummary;
        };
        price?: {
            unit: 'minorCurrency';
            currencyCode: string;
            points: [periodStart: string, valueAtPeriodEnd: number | null][];
            summary: ProductHistorySummary;
        };
    };
}

export interface PublicProductHistoryDeps {
    getProductHistorySurface: typeof getProductHistorySurface;
}

const defaultDeps: PublicProductHistoryDeps = {
    getProductHistorySurface,
};

export const getPublicProductHistory = async (
    input: PublicProductHistoryInput,
    deps: PublicProductHistoryDeps = defaultDeps
): Promise<PublicProductHistory> => {
    const canonicalInput = {
        ...input,
        asin: input.asin.trim().toUpperCase(),
    };
    const metrics = input.metrics.length > 0 ? input.metrics : [...publicProductHistoryMetrics];
    const response = (await deps.getProductHistorySurface({
        marketplaceId: canonicalInput.marketplaceId,
        asin: canonicalInput.asin,
        metrics: metrics.map(toInternalMetric),
        bucket: canonicalInput.bucket,
        days: canonicalInput.days,
        limit: canonicalInput.limit,
        startAt: canonicalInput.startAt,
        endAt: canonicalInput.endAt,
        format: 'agent',
        refresh: true,
        ownerMerchbaseUserId: canonicalInput.ownerMerchbaseUserId,
        signal: canonicalInput.signal,
    } satisfies ProductHistorySurfaceInput)) as AgentHistoryResponse;

    return {
        marketplaceId: response.marketplaceId,
        asin: response.asin,
        range: {
            startAt: response.range.startAt,
            endAt: response.range.endAt,
            interval: response.range.bucket,
        },
        series: {
            ...(metrics.includes('salesRank') ? { salesRank: mapSalesRankSeries(response) } : {}),
            ...(metrics.includes('price') ? { price: mapPriceSeries(response) } : {}),
        },
    };
};

const mapSalesRankSeries = (response: AgentHistoryResponse) => {
    const source = response.series.bsr;
    return {
        unit: 'rank' as const,
        category: source?.category ?? null,
        points: mapPoints(source?.buckets ?? []),
        summary: mapSummary(source?.summary),
    };
};

const mapPriceSeries = (response: AgentHistoryResponse) => {
    const source = response.series.price;
    return {
        unit: 'minorCurrency' as const,
        currencyCode: source?.currencyCode ?? 'USD',
        points: mapPoints(source?.buckets ?? []),
        summary: mapSummary(source?.summary),
    };
};

const mapPoints = (
    buckets: [string, number | null][]
): [periodStart: string, valueAtPeriodEnd: number | null][] =>
    buckets.map(([periodStart, valueAtPeriodEnd]) => [periodStart, valueAtPeriodEnd]);

const mapSummary = (
    summary: AgentHistoryResponse['series']['bsr'] extends infer Series
        ? Series extends { summary: infer Summary }
            ? Summary | undefined
            : never
        : never
): ProductHistorySummary => ({
    first: summary?.first ?? null,
    latest: summary?.latest ?? null,
    min: summary?.min ?? null,
    max: summary?.max ?? null,
});

const toInternalMetric = (metric: PublicProductHistoryMetric) =>
    metric === 'salesRank' ? ('bsr' as const) : ('price' as const);
