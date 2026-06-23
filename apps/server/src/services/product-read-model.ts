import { TRPCError } from '@trpc/server';
import type { ProductInfo } from '@/types/index.js';
import {
    type AgentHistoryResponse,
    resolveAgentHistoryWindow,
} from '@/services/product-history-agent.js';
import { resolveHistoryBucket } from '@/services/product-history-buckets.js';
import {
    getProductHistorySurface,
    type ProductHistoryMetric,
} from '@/services/product-history-surface.js';
import { fetchProductInfo } from '@/utils/product-info.js';

const DEFAULT_PRODUCT_GET_METRICS: readonly ProductHistoryMetric[] = ['bsr', 'price'];

type ProductReadInput = {
    marketplaceId: string;
    asin: string;
    startAt?: Date;
    endAt?: Date;
    limit: number;
    days: number;
    metrics?: ProductHistoryMetric[];
    bucket: 'auto' | 'day' | 'week' | 'month';
};

type ProductHistoryError = {
    schemaVersion: 2;
    status: 'error';
    latestImportAt: null;
    syncTriggered: false;
    range: {
        startAt: string;
        endAt: string;
        bucket: 'day' | 'week' | 'month';
    };
    series: {};
    error: {
        code: string;
        message: string;
    };
};

export type ProductReadModel = {
    schemaVersion: 1;
    marketplaceId: string;
    asin: string;
    status: 'ready' | 'partial';
    summary: ProductInfo;
    history: AgentHistoryResponse | ProductHistoryError;
};

export const getProductReadModel = async (input: ProductReadInput): Promise<ProductReadModel> => {
    const summary = await fetchProductInfo({
        marketplaceId: input.marketplaceId,
        asin: input.asin,
    });

    try {
        const history = (await getProductHistorySurface({
            ...input,
            metrics: input.metrics ?? [...DEFAULT_PRODUCT_GET_METRICS],
            format: 'agent',
            refresh: 'if_missing',
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
