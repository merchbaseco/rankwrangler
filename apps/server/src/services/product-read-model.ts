import { TRPCError } from '@trpc/server';
import type { AgentHistoryResponse } from '@/services/product-history-agent.js';
import {
    resolveAgentHistoryWindow,
    resolveHistoryBucket,
} from '@/services/product-history-buckets.js';
import {
    getProductHistorySurface,
    type ProductHistoryMetric,
} from '@/services/product-history-surface.js';
import type { ProductInfo } from '@/types/index.js';
import { getRequiredProduct } from './product-retrieval';
import { mapRetrievalError } from './retrieval-coordinator';

const DEFAULT_PRODUCT_GET_METRICS: readonly ProductHistoryMetric[] = ['bsr', 'price'];

interface ProductReadInput {
    marketplaceId: string;
    asin: string;
    startAt?: Date;
    endAt?: Date;
    limit: number;
    days: number;
    metrics?: ProductHistoryMetric[];
    bucket: 'auto' | 'day' | 'week' | 'month';
    refresh?: boolean;
    signal?: AbortSignal;
    ownerMerchbaseUserId: string;
}

interface ProductHistoryError {
    schemaVersion: 2;
    status: 'error';
    freshness: {
        stale: true;
        updatedAt: null;
    };
    range: {
        startAt: string;
        endAt: string;
        bucket: 'day' | 'week' | 'month';
    };
    series: Record<string, never>;
    error: {
        code: string;
        message: string;
        retryable: boolean;
        retryAfterSeconds?: number;
    };
}

export interface ProductReadModel {
    schemaVersion: 1;
    marketplaceId: string;
    asin: string;
    status: 'ready' | 'partial';
    summary: ProductInfo;
    history: AgentHistoryResponse | ProductHistoryError;
}

export const getProductReadModel = async (input: ProductReadInput): Promise<ProductReadModel> => {
    const summary = await getRequiredProduct({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        refresh: input.refresh,
        signal: input.signal,
    });

    try {
        const history = (await getProductHistorySurface({
            ...input,
            metrics: input.metrics ?? [...DEFAULT_PRODUCT_GET_METRICS],
            format: 'agent',
            refresh: input.refresh ?? false,
            ownerMerchbaseUserId: input.ownerMerchbaseUserId,
        })) as AgentHistoryResponse;

        return {
            schemaVersion: 1,
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            status: 'ready',
            summary,
            history,
        };
    } catch (error) {
        return {
            schemaVersion: 1,
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            status: 'partial',
            summary,
            history: buildHistoryError(input, error),
        };
    }
};

const buildHistoryError = (input: ProductReadInput, error: unknown): ProductHistoryError => {
    const publicError = mapRetrievalError(error);
    const historyWindow = resolveAgentHistoryWindow({
        startAt: input.startAt,
        endAt: input.endAt,
        days: input.days,
    });
    const bucket = resolveHistoryBucket({
        requestedBucket: input.bucket,
        startAt: historyWindow.startAt,
        endAt: historyWindow.endAt,
    });
    const code = publicError instanceof TRPCError ? publicError.code : 'INTERNAL_SERVER_ERROR';
    const retryAfterSeconds = resolveRetryAfterSeconds(publicError);

    return {
        schemaVersion: 2,
        status: 'error',
        freshness: {
            stale: true,
            updatedAt: null,
        },
        range: {
            startAt: historyWindow.startAt.toISOString(),
            endAt: historyWindow.endAt.toISOString(),
            bucket,
        },
        series: {},
        error: {
            code,
            message:
                publicError instanceof Error
                    ? publicError.message
                    : 'Failed to load product history for product get.',
            retryable: code === 'SERVICE_UNAVAILABLE' || code === 'TIMEOUT',
            ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        },
    };
};

const RETRY_AFTER_PATTERN = /Retry after (\d+) seconds?/i;

const resolveRetryAfterSeconds = (error: unknown) => {
    if (!(error instanceof Error)) {
        return undefined;
    }

    const match = RETRY_AFTER_PATTERN.exec(error.message);
    return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
};
