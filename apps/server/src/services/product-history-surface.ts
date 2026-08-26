import { TRPCError } from '@trpc/server';
import { getLatestProductHistoryOperation, getOperationById } from '@/db/operations.js';
import {
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
} from '@/services/keepa.js';
import type { KeepaHistoryMetricKey } from '@/services/keepa-history-metrics.js';
import {
    type ProductHistoryBucket,
    resolveAgentHistoryWindow,
} from '@/services/product-history-buckets.js';
import { ensureProductHistoryWork } from '@/services/product-history-operations.js';
import {
    awaitProductHistoryRetrieval,
    buildProductHistoryFreshness,
    type ProductHistoryRetrievalDeps,
    shouldWaitForProductHistory,
} from '@/services/product-history-retrieval.js';
import { buildMetricHistoryResponse } from '@/services/product-history-surface-response.js';
import { getRequiredProduct } from './product-retrieval';

export const productHistoryMetrics = ['bsr', 'price'] as const;
export const productHistoryFormats = ['points', 'legacy', 'agent'] as const;

const PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export type ProductHistoryMetric = (typeof productHistoryMetrics)[number];
export type ProductHistoryFormat = (typeof productHistoryFormats)[number];

interface ProductHistorySurfaceInputBase {
    marketplaceId: string;
    asin: string;
    metric?: KeepaHistoryMetricKey;
    metrics?: ProductHistoryMetric[];
    categoryId?: number;
    startAt?: Date;
    endAt?: Date;
    limit: number;
    days: number;
    bucket: ProductHistoryBucket;
    refresh: boolean;
    ownerMerchbaseUserId: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export type ProductHistorySurfaceInput =
    | (ProductHistorySurfaceInputBase & { format: 'points' })
    | (ProductHistorySurfaceInputBase & { format: 'legacy' | 'agent' });

type ProductHistoryMetricInput = Extract<
    ProductHistorySurfaceInput,
    { format: 'legacy' | 'agent' }
>;

export interface ProductHistorySurfaceDeps {
    getRequiredProduct: typeof getRequiredProduct;
    getProductHistoryPoints: typeof getProductHistoryPoints;
    hasRecentSuccessfulKeepaImportForAsin: typeof hasRecentSuccessfulKeepaImportForAsin;
    ensureProductHistoryWork: typeof ensureProductHistoryWork;
    getOperationById: typeof getOperationById;
    getLatestProductHistoryOperation: typeof getLatestProductHistoryOperation;
    sleep: ProductHistoryRetrievalDeps['sleep'];
    now?: () => Date;
}

const defaultDeps: ProductHistorySurfaceDeps = {
    getRequiredProduct,
    getProductHistoryPoints,
    hasRecentSuccessfulKeepaImportForAsin,
    ensureProductHistoryWork,
    getOperationById,
    getLatestProductHistoryOperation,
    sleep: async delayMs => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
    },
    now: () => new Date(),
};

export const getProductHistorySurface = async (
    input: ProductHistorySurfaceInput,
    deps: ProductHistorySurfaceDeps = defaultDeps
) => {
    const canonicalInput = { ...input, asin: input.asin.trim().toUpperCase() };
    await deps.getRequiredProduct({
        marketplaceId: canonicalInput.marketplaceId,
        asin: canonicalInput.asin,
        maxAgeMs: PRODUCT_HISTORY_PRODUCT_CACHE_MAX_AGE_MS,
    });

    if (canonicalInput.format === 'points') {
        return await getPointsHistory(canonicalInput, deps);
    }

    return await getMetricHistory(canonicalInput, deps);
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

    const freshness = buildProductHistoryFreshness([result.latestImportAt], getNow(deps));
    if (
        await shouldWaitForProductHistory({
            refresh: input.refresh,
            points: result.points,
            freshness,
            coverageStartAt: input.startAt,
            hasRecentSuccessfulImport: () =>
                deps.hasRecentSuccessfulKeepaImportForAsin({
                    marketplaceId: input.marketplaceId,
                    asin: input.asin,
                }),
        })
    ) {
        await awaitProductHistoryRetrieval(input, getRetrievalDeps(deps));
        return await getPointsHistoryAfterRetrieval(input, deps);
    }

    const { latestImportAt: _latestImportAt, ...history } = result;

    return {
        ...history,
        freshness,
    };
};

const getPointsHistoryAfterRetrieval = async (
    input: ProductHistorySurfaceInput,
    deps: ProductHistorySurfaceDeps
) => {
    const result = await deps.getProductHistoryPoints({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        metric: input.metric as KeepaHistoryMetricKey,
        categoryId: input.categoryId,
        startAt: input.startAt,
        endAt: input.endAt,
        limit: input.limit,
    });
    const { latestImportAt: _latestImportAt, ...history } = result;
    return {
        ...history,
        freshness: buildProductHistoryFreshness([result.latestImportAt], getNow(deps)),
    };
};

const getMetricHistory = async (
    input: ProductHistoryMetricInput,
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
    const primaryResult = metricEntries.find(
        ([metric]) => metric === resolvePrimaryMetric(requestedMetrics)
    )?.[1];

    const freshness = buildProductHistoryFreshness(
        metricEntries.map(([, result]) => result.latestImportAt),
        getNow(deps)
    );
    if (
        await shouldWaitForProductHistory({
            refresh: input.refresh,
            points: primaryResult?.points ?? [],
            freshness,
            coverageStartAt: agentWindow?.startAt ?? input.startAt,
            hasRecentSuccessfulImport: () =>
                deps.hasRecentSuccessfulKeepaImportForAsin({
                    marketplaceId: input.marketplaceId,
                    asin: input.asin,
                }),
        })
    ) {
        await awaitProductHistoryRetrieval(input, getRetrievalDeps(deps));
        return await getMetricHistoryAfterRetrieval(input, deps);
    }

    return buildMetricHistoryResponse({
        input,
        requestedMetrics,
        agentWindow,
        metricEntries,
        freshness,
    });
};

const getMetricHistoryAfterRetrieval = async (
    input: ProductHistoryMetricInput,
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
    const freshness = buildProductHistoryFreshness(
        metricEntries.map(([, result]) => result.latestImportAt),
        getNow(deps)
    );
    return buildMetricHistoryResponse({
        input,
        requestedMetrics,
        agentWindow,
        metricEntries,
        freshness,
    });
};
const getRetrievalDeps = (deps: ProductHistorySurfaceDeps): ProductHistoryRetrievalDeps => ({
    ensureProductHistoryWork: deps.ensureProductHistoryWork,
    getOperationById: deps.getOperationById,
    getLatestProductHistoryOperation: deps.getLatestProductHistoryOperation,
    sleep: deps.sleep,
    now: deps.now,
});
const getNow = (deps: ProductHistorySurfaceDeps) => deps.now?.() ?? new Date();
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
const loadMetricEntries = ({
    input,
    requestedMetrics,
    agentWindow,
    deps,
}: {
    input: ProductHistoryMetricInput;
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
