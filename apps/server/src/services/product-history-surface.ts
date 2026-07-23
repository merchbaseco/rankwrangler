import { TRPCError } from '@trpc/server';
import { loadKeepaProductHistoryManually } from '@/services/keepa-manual-load.js';
import {
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
    type KeepaHistoryMetricKey,
} from '@/services/keepa.js';
import {
    buildAgentHistoryResponse,
    resolveAgentHistoryWindow,
    type HistoryMetricResult,
} from '@/services/product-history-agent.js';
import { type ProductHistoryBucket } from '@/services/product-history-buckets.js';
import { resolveProductHistorySyncDays } from '@/services/product-history-sync-days.js';
import { fetchProductInfo } from '@/utils/product-info.js';

export const productHistoryMetrics = ['bsr', 'price'] as const;
export const productHistoryFormats = ['points', 'legacy', 'agent'] as const;
export const productHistoryRefreshModes = ['none', 'if_missing', 'force'] as const;

const PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export type ProductHistoryMetric = (typeof productHistoryMetrics)[number];
export type ProductHistoryFormat = (typeof productHistoryFormats)[number];
export type ProductHistoryRefreshMode = (typeof productHistoryRefreshModes)[number];

type ProductHistorySurfaceInput = {
    marketplaceId: string;
    asin: string;
    metric?: KeepaHistoryMetricKey;
    metrics?: ProductHistoryMetric[];
    categoryId?: number;
    startAt?: Date;
    endAt?: Date;
    limit: number;
    days: number;
    format: ProductHistoryFormat;
    bucket: ProductHistoryBucket;
    refresh: ProductHistoryRefreshMode;
};

type MetricEntry = readonly [ProductHistoryMetric, HistoryMetricResult];

export const getProductHistorySurface = async (input: ProductHistorySurfaceInput) => {
    await fetchProductInfo({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        maxAgeMs: PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS,
    });

    if (input.format === 'points') {
        return await getPointsHistory(input);
    }

    return await getMetricHistory(input);
};

const getPointsHistory = async (input: ProductHistorySurfaceInput) => {
    if (!input.metric) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'metric is required for points history format',
        });
    }

    let syncTriggered = false;
    if (input.refresh === 'force') {
        syncTriggered = await syncProductHistory(input);
    }

    let result = await getProductHistoryPoints({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        metric: input.metric,
        categoryId: input.categoryId,
        startAt: input.startAt,
        endAt: input.endAt,
        limit: input.limit,
    });

    if (input.refresh === 'if_missing' && (await shouldSyncProductHistory(input, null, result.points))) {
        syncTriggered = await syncProductHistory(input);
        result = await getProductHistoryPoints({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            metric: input.metric,
            categoryId: input.categoryId,
            startAt: input.startAt,
            endAt: input.endAt,
            limit: input.limit,
        });
    }

    return {
        ...result,
        syncTriggered,
    };
};

const getMetricHistory = async (input: ProductHistorySurfaceInput) => {
    const requestedMetrics = normalizeRequestedMetrics(input.metrics);
    const agentWindow =
        input.format === 'agent'
            ? resolveAgentHistoryWindow({
                  startAt: input.startAt,
                  endAt: input.endAt,
                  days: input.days,
              })
            : null;

    let syncTriggered = false;
    if (input.refresh === 'force') {
        syncTriggered = await syncProductHistory(input, agentWindow);
    }

    let metricEntries = await loadMetricEntries({ input, requestedMetrics, agentWindow });
    let resultsByMetric = buildResultsByMetric(metricEntries);
    const primaryMetric = resolvePrimaryMetric(requestedMetrics);
    let primaryResult = resultsByMetric[primaryMetric];

    if (
        input.refresh === 'if_missing' &&
        primaryResult &&
        (await shouldSyncProductHistory(input, agentWindow, primaryResult.points))
    ) {
        syncTriggered = (await syncProductHistory(input, agentWindow)) || syncTriggered;
        metricEntries = await loadMetricEntries({ input, requestedMetrics, agentWindow });
        resultsByMetric = buildResultsByMetric(metricEntries);
        primaryResult = resultsByMetric[primaryMetric];
    }

    if (input.format === 'legacy') {
        const legacyResult = resultsByMetric.bsr;
        return buildLegacyHistoryResponse({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            latestImportAt: legacyResult?.latestImportAt ?? null,
            categoryNames: legacyResult?.categoryNames ?? {},
            points: legacyResult?.points ?? [],
            syncTriggered,
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
        collecting: false,
        syncTriggered,
        resultsByMetric: primaryResult ? resultsByMetric : {},
    });
};

const shouldSyncProductHistory = async (
    input: ProductHistorySurfaceInput,
    agentWindow: { startAt: Date; endAt: Date } | null,
    points: HistoryMetricResult['points']
) => {
    if (hasHistoryCoverage(points, agentWindow?.startAt ?? input.startAt)) {
        return false;
    }

    return !(await hasRecentSuccessfulKeepaImportForAsin({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
    }));
};

const syncProductHistory = async (
    input: ProductHistorySurfaceInput,
    agentWindow: { startAt: Date; endAt: Date } | null = null
) => {
    const summary = await loadKeepaProductHistoryManually({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        days: resolveProductHistorySyncDays(input, agentWindow),
    });

    return !summary.cached;
};

const hasHistoryCoverage = (points: HistoryMetricResult['points'], startAt: Date | undefined) => {
    if (points.length === 0) {
        return false;
    }

    if (!startAt) {
        return true;
    }

    const startMs = startAt.getTime();
    return points.some(point => Date.parse(point.observedAt) <= startMs);
};

const normalizeRequestedMetrics = (metrics: ProductHistoryMetric[] | undefined) => {
    if (!metrics || metrics.length === 0) {
        return ['bsr'] as ProductHistoryMetric[];
    }

    return Array.from(new Set(metrics));
};

const resolvePrimaryMetric = (metrics: ProductHistoryMetric[]) => {
    return metrics.includes('bsr') ? 'bsr' : (metrics[0] ?? 'bsr');
};

const resolveKeepaMetric = (metric: ProductHistoryMetric): KeepaHistoryMetricKey => {
    if (metric === 'bsr') {
        return 'bsrMain';
    }

    return 'priceNew';
};

const loadMetricEntries = async ({
    input,
    requestedMetrics,
    agentWindow,
}: {
    input: ProductHistorySurfaceInput;
    requestedMetrics: ProductHistoryMetric[];
    agentWindow: { startAt: Date; endAt: Date } | null;
}) => {
    return Promise.all(
        requestedMetrics.map(async metric => {
            const result = await getProductHistoryPoints({
                marketplaceId: input.marketplaceId,
                asin: input.asin,
                metric: resolveKeepaMetric(metric),
                startAt: agentWindow?.startAt ?? input.startAt,
                endAt: agentWindow?.endAt ?? input.endAt,
                limit: input.limit,
            });

            return [metric, result] as const;
        })
    );
};

const buildResultsByMetric = (metricEntries: MetricEntry[]) => {
    return Object.fromEntries(metricEntries) as Partial<
        Record<ProductHistoryMetric, MetricEntry[1]>
    >;
};

const buildLegacyHistoryResponse = ({
    marketplaceId,
    asin,
    latestImportAt,
    categoryNames,
    points,
    syncTriggered,
}: {
    marketplaceId: string;
    asin: string;
    latestImportAt: string | null;
    categoryNames: Record<string, string>;
    points: HistoryMetricResult['points'];
    syncTriggered: boolean;
}) => {
    return {
        marketplaceId,
        asin,
        metric: 'bsrMain' as const,
        latestImportAt,
        categoryNames,
        points,
        collecting: false,
        syncTriggered,
    };
};
