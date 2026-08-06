import { TRPCError } from '@trpc/server';
import { getLatestProductHistoryOperation } from '@/db/operations.js';
import {
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
    type KeepaHistoryMetricKey,
} from '@/services/keepa.js';
import { buildPublicOperation } from '@/services/operations.js';
import {
    buildOperationalAgentHistoryResponse,
    type HistoryMetricResult,
} from '@/services/product-history-agent.js';
import {
    type ProductHistoryBucket,
    resolveAgentHistoryWindow,
} from '@/services/product-history-buckets.js';
import { buildOperationalLegacyHistoryResponse } from '@/services/product-history-legacy.js';
import { requestProductHistoryRefresh } from '@/services/product-history-operations.js';
import { getRequiredProduct } from './product-retrieval';

export const productHistoryRefreshModes = ['none', 'if_missing', 'force'] as const;
const PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

type ProductHistoryMetric = 'bsr' | 'price';
type ProductHistoryRefreshMode = (typeof productHistoryRefreshModes)[number];

interface ProductHistoryOperationSurfaceInput {
    marketplaceId: string;
    asin: string;
    metric?: KeepaHistoryMetricKey;
    metrics?: ProductHistoryMetric[];
    categoryId?: number;
    startAt?: Date;
    endAt?: Date;
    limit: number;
    days: number;
    format: 'points' | 'legacy' | 'agent';
    bucket: ProductHistoryBucket;
    refresh: ProductHistoryRefreshMode;
    ownerMerchbaseUserId: string;
}

interface ProductHistoryOperationSurfaceDeps {
    getRequiredProduct: typeof getRequiredProduct;
    getProductHistoryPoints: typeof getProductHistoryPoints;
    hasRecentSuccessfulKeepaImportForAsin: typeof hasRecentSuccessfulKeepaImportForAsin;
    requestProductHistoryRefresh: typeof requestProductHistoryRefresh;
    getLatestProductHistoryOperation: typeof getLatestProductHistoryOperation;
}

const defaultDeps: ProductHistoryOperationSurfaceDeps = {
    getRequiredProduct,
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
    requestProductHistoryRefresh,
    getLatestProductHistoryOperation,
};

export const getProductHistoryOperationSurface = async (
    input: ProductHistoryOperationSurfaceInput,
    deps: ProductHistoryOperationSurfaceDeps = defaultDeps
) => {
    await deps.getRequiredProduct({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        maxAgeMs: PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS,
    });

    return input.format === 'points'
        ? await getPointsHistory(input, deps)
        : await getMetricHistory(input, deps);
};

const getPointsHistory = async (
    input: ProductHistoryOperationSurfaceInput,
    deps: ProductHistoryOperationSurfaceDeps
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
    const requested = await requestRefreshIfNeeded(input, result.points, deps);
    const operation = requested?.operation ?? (await getPendingOperation(input, deps));

    return {
        ...result,
        collecting: operation?.status === 'pending',
        syncTriggered: requested?.created ?? false,
        operation,
    };
};

const getMetricHistory = async (
    input: ProductHistoryOperationSurfaceInput,
    deps: ProductHistoryOperationSurfaceDeps
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
    const metricEntries = await loadMetricEntries(input, requestedMetrics, agentWindow, deps);
    const resultsByMetric = Object.fromEntries(metricEntries) as Partial<
        Record<ProductHistoryMetric, HistoryMetricResult>
    >;
    const primaryResult = resultsByMetric[resolvePrimaryMetric(requestedMetrics)];
    const requested = primaryResult
        ? await requestRefreshIfNeeded(input, primaryResult.points, deps, agentWindow?.startAt)
        : null;
    const operation = requested?.operation ?? (await getPendingOperation(input, deps));
    const syncTriggered = requested?.created ?? false;

    if (input.format === 'legacy') {
        const result = resultsByMetric.bsr;
        return buildOperationalLegacyHistoryResponse({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            latestImportAt: result?.latestImportAt ?? null,
            categoryNames: result?.categoryNames ?? {},
            points: result?.points ?? [],
            syncTriggered,
            operation,
        });
    }

    const emptyWindow = resolveAgentHistoryWindow(input);
    return buildOperationalAgentHistoryResponse({
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

const requestRefreshIfNeeded = async (
    input: ProductHistoryOperationSurfaceInput,
    points: HistoryMetricResult['points'],
    deps: ProductHistoryOperationSurfaceDeps,
    coverageStartAt = input.startAt
) => {
    const shouldRequest =
        input.refresh === 'force' ||
        (input.refresh === 'if_missing' &&
            !hasHistoryCoverage(points, coverageStartAt) &&
            !(await deps.hasRecentSuccessfulKeepaImportForAsin({
                marketplaceId: input.marketplaceId,
                asin: input.asin,
            })));
    return shouldRequest
        ? await deps.requestProductHistoryRefresh({
              marketplaceId: input.marketplaceId,
              asin: input.asin,
              ownerMerchbaseUserId: input.ownerMerchbaseUserId,
          })
        : null;
};

const getPendingOperation = async (
    input: ProductHistoryOperationSurfaceInput,
    deps: ProductHistoryOperationSurfaceDeps
) => {
    const operation = await deps.getLatestProductHistoryOperation({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
    });
    return operation?.status === 'pending' ? buildPublicOperation(operation) : null;
};

const loadMetricEntries = (
    input: ProductHistoryOperationSurfaceInput,
    requestedMetrics: ProductHistoryMetric[],
    agentWindow: { startAt: Date; endAt: Date } | null,
    deps: ProductHistoryOperationSurfaceDeps
) =>
    Promise.all(
        requestedMetrics.map(async metric => {
            const result = await deps.getProductHistoryPoints({
                marketplaceId: input.marketplaceId,
                asin: input.asin,
                metric: metric === 'bsr' ? 'bsrMain' : 'priceNew',
                startAt: agentWindow?.startAt ?? input.startAt,
                endAt: agentWindow?.endAt ?? input.endAt,
                limit: input.limit,
            });
            return [metric, result] as const;
        })
    );

const hasHistoryCoverage = (
    points: HistoryMetricResult['points'],
    coverageStartAt: Date | undefined
) =>
    points.length > 0 &&
    (!coverageStartAt ||
        points.some(point => Date.parse(point.observedAt) <= coverageStartAt.getTime()));

const normalizeRequestedMetrics = (metrics: ProductHistoryMetric[] | undefined) =>
    metrics?.length ? Array.from(new Set(metrics)) : (['bsr'] as ProductHistoryMetric[]);

const resolvePrimaryMetric = (metrics: ProductHistoryMetric[]) =>
    metrics.includes('bsr') ? 'bsr' : (metrics[0] ?? 'bsr');
