import { TRPCError } from '@trpc/server';
import { getPendingProductHistoryOperation } from '@/db/operations.js';
import {
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
    type KeepaHistoryMetricKey,
} from '@/services/keepa.js';
import { buildPublicOperation } from '@/services/operations.js';
import {
    buildAgentHistoryResponse,
    type HistoryMetricResult,
    resolveAgentHistoryWindow,
} from '@/services/product-history-agent.js';
import type { ProductHistoryBucket } from '@/services/product-history-buckets.js';
import { buildLegacyHistoryResponse } from '@/services/product-history-legacy.js';
import { requestProductHistoryRefresh } from '@/services/product-history-operations.js';
import { getRequiredProduct } from './product-retrieval';

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
    ownerMerchbaseUserId: string;
};

type MetricEntry = readonly [ProductHistoryMetric, HistoryMetricResult];

export type ProductHistorySurfaceDeps = {
    getRequiredProduct: typeof getRequiredProduct;
    getProductHistoryPoints: typeof getProductHistoryPoints;
    hasRecentSuccessfulKeepaImportForAsin: typeof hasRecentSuccessfulKeepaImportForAsin;
    requestProductHistoryRefresh: typeof requestProductHistoryRefresh;
    getPendingProductHistoryOperation: typeof getPendingProductHistoryOperation;
};

const defaultDeps: ProductHistorySurfaceDeps = {
    getRequiredProduct,
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
    requestProductHistoryRefresh,
    getPendingProductHistoryOperation,
};

export const getProductHistorySurface = async (
    input: ProductHistorySurfaceInput,
    deps: ProductHistorySurfaceDeps = defaultDeps
) => {
    await deps.getRequiredProduct({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        maxAgeMs: PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS,
    });

    if (input.format === 'points') {
        return await getPointsHistory(input, deps);
    }

    return await getMetricHistory(input, deps);
};

const getPointsHistory = async (
    input: ProductHistorySurfaceInput,
    deps: ProductHistorySurfaceDeps
) => {
    if (!input.metric) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'metric is required for points history format',
        });
    }

    const result = await deps.getProductHistoryPoints({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        metric: input.metric,
        categoryId: input.categoryId,
        startAt: input.startAt,
        endAt: input.endAt,
        limit: input.limit,
    });

    const shouldRequest =
        input.refresh === 'force' ||
        (input.refresh === 'if_missing' &&
            (await shouldSyncProductHistory(input, null, result.points, deps)));
    const requested = shouldRequest
        ? await deps.requestProductHistoryRefresh({
              marketplaceId: input.marketplaceId,
              asin: input.asin,
              ownerMerchbaseUserId: input.ownerMerchbaseUserId,
          })
        : null;
    const operation = requested?.operation ?? (await getPendingOperation(input, deps));

    return {
        ...result,
        collecting: operation?.status === 'pending',
        syncTriggered: requested?.created ?? false,
        operation,
    };
};

const getMetricHistory = async (
    input: ProductHistorySurfaceInput,
    deps: ProductHistorySurfaceDeps
) => {
    const requestedMetrics = normalizeRequestedMetrics(input.metrics);
    const agentWindow =
        input.format === 'agent'
            ? resolveAgentHistoryWindow({
                  startAt: input.startAt,
                  endAt: input.endAt,
                  days: input.days,
              })
            : null;

    const metricEntries = await loadMetricEntries({
        input,
        requestedMetrics,
        agentWindow,
        deps,
    });
    const resultsByMetric = buildResultsByMetric(metricEntries);
    const primaryMetric = resolvePrimaryMetric(requestedMetrics);
    const primaryResult = resultsByMetric[primaryMetric];

    const shouldRequest =
        input.refresh === 'force' ||
        (input.refresh === 'if_missing' &&
            Boolean(
                primaryResult &&
                    (await shouldSyncProductHistory(input, agentWindow, primaryResult.points, deps))
            ));
    const requested = shouldRequest
        ? await deps.requestProductHistoryRefresh({
              marketplaceId: input.marketplaceId,
              asin: input.asin,
              ownerMerchbaseUserId: input.ownerMerchbaseUserId,
          })
        : null;
    const operation = requested?.operation ?? (await getPendingOperation(input, deps));
    const syncTriggered = requested?.created ?? false;

    if (input.format === 'legacy') {
        const legacyResult = resultsByMetric.bsr;
        return buildLegacyHistoryResponse({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            latestImportAt: legacyResult?.latestImportAt ?? null,
            categoryNames: legacyResult?.categoryNames ?? {},
            points: legacyResult?.points ?? [],
            syncTriggered,
            operation,
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
        collecting: operation?.status === 'pending',
        syncTriggered,
        operation,
        resultsByMetric: primaryResult ? resultsByMetric : {},
    });
};

const shouldSyncProductHistory = async (
    input: ProductHistorySurfaceInput,
    agentWindow: { startAt: Date; endAt: Date } | null,
    points: HistoryMetricResult['points'],
    deps: ProductHistorySurfaceDeps
) => {
    if (hasHistoryCoverage(points, agentWindow?.startAt ?? input.startAt)) {
        return false;
    }

    return !(await deps.hasRecentSuccessfulKeepaImportForAsin({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
    }));
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
    deps,
}: {
    input: ProductHistorySurfaceInput;
    requestedMetrics: ProductHistoryMetric[];
    agentWindow: { startAt: Date; endAt: Date } | null;
    deps: ProductHistorySurfaceDeps;
}) => {
    return Promise.all(
        requestedMetrics.map(async metric => {
            const result = await deps.getProductHistoryPoints({
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

const getPendingOperation = async (
    input: ProductHistorySurfaceInput,
    deps: ProductHistorySurfaceDeps
) => {
    const operation = await deps.getPendingProductHistoryOperation({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
    });
    return operation ? buildPublicOperation(operation) : null;
};
