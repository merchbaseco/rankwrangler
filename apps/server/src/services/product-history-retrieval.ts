import { getLatestProductHistoryOperation, getOperationById } from '@/db/operations.js';
import {
    KEEPA_FAILURE_RETRY_BASE_MS,
    KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS,
} from '@/services/keepa-refresh-policy.js';
import type { OperationRecord } from '@/services/operations.js';
import type {
    HistoryMetricResult,
    ProductHistoryFreshness,
} from '@/services/product-history-agent.js';
import {
    ensureProductHistoryWork,
    PRODUCT_HISTORY_RETRY_AFTER_SECONDS,
} from '@/services/product-history-operations.js';
import {
    coordinateRetrieval,
    RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
    RetrievalRetryableError,
} from '@/services/retrieval-coordinator.js';

const PRODUCT_HISTORY_WORK_TIMEOUT_MS = 5 * 60 * 1000;
const PRODUCT_HISTORY_POLL_INTERVAL_MS = PRODUCT_HISTORY_RETRY_AFTER_SECONDS * 1000;
const PRODUCT_HISTORY_FAILURE_COOLDOWN_SECONDS = KEEPA_FAILURE_RETRY_BASE_MS / 1000;

export interface ProductHistoryRetrievalDeps {
    ensureProductHistoryWork: typeof ensureProductHistoryWork;
    getOperationById: typeof getOperationById;
    getLatestProductHistoryOperation: typeof getLatestProductHistoryOperation;
    sleep: (delayMs: number) => Promise<void>;
    now?: () => Date;
    workTimeoutMs?: number;
}

export const shouldWaitForProductHistory = async ({
    refresh,
    points,
    freshness,
    coverageStartAt,
    hasRecentSuccessfulImport,
}: {
    refresh: boolean;
    points: HistoryMetricResult['points'];
    freshness: ProductHistoryFreshness;
    coverageStartAt?: Date;
    hasRecentSuccessfulImport: () => Promise<boolean>;
}) => {
    if (refresh && freshness.stale) {
        return true;
    }
    if (hasHistoryCoverage(points, coverageStartAt)) {
        return false;
    }
    return !(await hasRecentSuccessfulImport());
};

export const buildProductHistoryFreshness = (
    updatedAtValues: Array<string | null>,
    now: Date
): ProductHistoryFreshness => {
    const updatedAt = resolveLatestImportAt(updatedAtValues);
    const staleBefore = now.getTime() - KEEPA_FETCH_SUCCESS_GUARD_INTERVAL_MS;

    return {
        stale: !updatedAt || Date.parse(updatedAt) <= staleBefore,
        updatedAt,
    };
};

const sleep = async (delayMs: number) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
};

const defaultDeps: ProductHistoryRetrievalDeps = {
    ensureProductHistoryWork,
    getOperationById,
    getLatestProductHistoryOperation,
    sleep,
};

export const awaitProductHistoryRetrieval = async (
    {
        marketplaceId,
        asin,
        ownerMerchbaseUserId,
        refresh,
        signal,
        timeoutMs = RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
    }: {
        marketplaceId: string;
        asin: string;
        ownerMerchbaseUserId: string;
        refresh: boolean;
        signal?: AbortSignal;
        timeoutMs?: number;
    },
    deps: ProductHistoryRetrievalDeps = defaultDeps
) => {
    return await coordinateRetrieval({
        key: `${marketplaceId}:${asin.trim().toUpperCase()}:product-history`,
        signal,
        timeoutMs,
        retryMessage: 'Product history is temporarily unavailable. Retry shortly.',
        work: async () => {
            const latest = await deps.getLatestProductHistoryOperation({
                marketplaceId,
                asin,
            });
            if (
                latest?.status === 'completed' &&
                latest.error?.code === 'RESOURCE_NOT_FOUND' &&
                (!refresh ||
                    (deps.now?.() ?? new Date()).getTime() - latest.updatedAt.getTime() <
                        KEEPA_FAILURE_RETRY_BASE_MS)
            ) {
                return 'empty' as const;
            }

            if (
                latest?.status === 'completed' &&
                latest.error?.code === 'PROVIDER_UNAVAILABLE' &&
                (deps.now?.() ?? new Date()).getTime() - latest.updatedAt.getTime() <
                    KEEPA_FAILURE_RETRY_BASE_MS
            ) {
                throw new RetrievalRetryableError(
                    'Product history is temporarily unavailable. Retry shortly.',
                    {
                        retryAfterSeconds: PRODUCT_HISTORY_FAILURE_COOLDOWN_SECONDS,
                        reason: 'capacity',
                    }
                );
            }

            const ensured = await deps.ensureProductHistoryWork({
                marketplaceId,
                asin,
                ownerMerchbaseUserId,
            });
            if (!ensured.dispatched) {
                throw new RetrievalRetryableError(
                    'Product history is temporarily unavailable. Retry shortly.',
                    {
                        retryAfterSeconds: PRODUCT_HISTORY_RETRY_AFTER_SECONDS,
                        reason: 'capacity',
                    }
                );
            }

            return await waitForProductHistoryOperation(ensured.operation.id, deps);
        },
    });
};

const waitForProductHistoryOperation = async (
    operationId: string,
    deps: ProductHistoryRetrievalDeps
) => {
    const deadline =
        (deps.now?.() ?? new Date()).getTime() +
        (deps.workTimeoutMs ?? PRODUCT_HISTORY_WORK_TIMEOUT_MS);

    while ((deps.now?.() ?? new Date()).getTime() < deadline) {
        const operation = await deps.getOperationById(operationId);
        if (!operation) {
            throw new RetrievalRetryableError(
                'Product history is temporarily unavailable. Retry shortly.',
                { retryAfterSeconds: PRODUCT_HISTORY_RETRY_AFTER_SECONDS }
            );
        }
        if (operation.type !== 'productHistoryRefresh') {
            throw new RetrievalRetryableError(
                'Product history is temporarily unavailable. Retry shortly.',
                { retryAfterSeconds: PRODUCT_HISTORY_RETRY_AFTER_SECONDS }
            );
        }
        if (operation.status === 'completed') {
            return resolveCompletedOperation(operation);
        }

        await deps.sleep(PRODUCT_HISTORY_POLL_INTERVAL_MS);
    }

    throw new RetrievalRetryableError(
        'Product history is temporarily unavailable. Retry shortly.',
        { retryAfterSeconds: PRODUCT_HISTORY_RETRY_AFTER_SECONDS }
    );
};

const resolveCompletedOperation = (
    operation: Extract<OperationRecord, { type: 'productHistoryRefresh' }>
) => {
    if (!operation.error) {
        return 'completed' as const;
    }
    if (operation.error.code === 'RESOURCE_NOT_FOUND') {
        return 'empty' as const;
    }

    throw new RetrievalRetryableError(
        'Product history is temporarily unavailable. Retry shortly.',
        { retryAfterSeconds: PRODUCT_HISTORY_RETRY_AFTER_SECONDS }
    );
};

const hasHistoryCoverage = (
    points: HistoryMetricResult['points'],
    coverageStartAt: Date | undefined
) => {
    if (points.length === 0) {
        return false;
    }
    if (!coverageStartAt) {
        return true;
    }

    const startAtMs = coverageStartAt.getTime();
    return points.some(point => Date.parse(point.observedAt) <= startAtMs);
};

const resolveLatestImportAt = (values: Array<string | null>) => {
    let latest: Date | null = null;
    for (const value of values) {
        if (!value) {
            continue;
        }

        const candidate = new Date(value);
        if (Number.isNaN(candidate.getTime()) || (latest && candidate <= latest)) {
            continue;
        }

        latest = candidate;
    }

    return latest?.toISOString() ?? null;
};
