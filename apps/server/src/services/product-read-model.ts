import { TRPCError } from '@trpc/server';
import type { PublicOperation } from '@/services/operations.js';
import type { OperationalAgentHistoryResponse } from '@/services/product-history-agent.js';
import {
    resolveAgentHistoryWindow,
    resolveHistoryBucket,
} from '@/services/product-history-buckets.js';
import { getProductHistoryOperationSurface } from '@/services/product-history-operation-surface.js';
import type { ProductHistoryMetric } from '@/services/product-history-surface.js';
import type { ProductInfo } from '@/types/index.js';
import { getRequiredProduct } from './product-retrieval';

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
    latestImportAt: null;
    syncTriggered: false;
    operation: PublicOperation | null;
    range: {
        startAt: string;
        endAt: string;
        bucket: 'day' | 'week' | 'month';
    };
    series: Record<string, never>;
    error: {
        code: string;
        message: string;
    };
}

export interface ProductReadModel {
    schemaVersion: 1;
    marketplaceId: string;
    asin: string;
    status: 'ready' | 'partial';
    summary: ProductInfo;
    history: OperationalAgentHistoryResponse | ProductHistoryError;
}

export const getProductReadModel = async (input: ProductReadInput): Promise<ProductReadModel> => {
    const summary = await getRequiredProduct({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
        refresh: input.refresh,
        signal: input.signal,
    });

    try {
        const history = (await getProductHistoryOperationSurface({
            ...input,
            metrics: input.metrics ?? [...DEFAULT_PRODUCT_GET_METRICS],
            format: 'agent',
            refresh: 'if_missing',
            ownerMerchbaseUserId: input.ownerMerchbaseUserId,
        })) as OperationalAgentHistoryResponse;

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

    return {
        schemaVersion: 2,
        status: 'error',
        latestImportAt: null,
        syncTriggered: false,
        operation: null,
        range: {
            startAt: historyWindow.startAt.toISOString(),
            endAt: historyWindow.endAt.toISOString(),
            bucket,
        },
        series: {},
        error: {
            code: error instanceof TRPCError ? error.code : 'INTERNAL_SERVER_ERROR',
            message:
                error instanceof Error
                    ? error.message
                    : 'Failed to load product history for product get.',
        },
    };
};
