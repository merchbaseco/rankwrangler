import { z } from 'zod';
import { deleteSpApiSyncQueueItems } from '@/db/spapi-sync-queue/delete-queue-items.js';
import { getSpApiSyncQueueItems } from '@/db/spapi-sync-queue/get-queue-items.js';
import { defineJob } from '@/jobs/job-router.js';
import type { ProcessSpApiSyncQueueResult } from '@/jobs/process-spapi-sync-queue-types';
import { createEventLogSafe, createEventLogsSafe } from '@/services/event-logs.js';
import { getErrorMessage } from '@/services/job-executions-utils.js';
import {
    type PersistProductSyncResultsInput,
    persistProductSyncResults,
} from '@/services/product-retrieval';
import { resolveProductDetails } from '@/services/product-retrieval-work';
import { notifyProductSyncCompleted } from '@/services/product-sync-events';
import { SpApiLimiterWaitError } from '@/services/providers/sp-api/sp-api-limiter-wait';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator';
import { searchCatalogItemsByAsins } from '@/services/spapi/index.js';
import { sendProcessSpApiSyncQueueJob } from '@/services/spapi-sync-queue.js';

const SP_API_SYNC_BATCH_SIZE = 20;
// One batch is one Catalog call: up to 5 backoff attempts of a 45s SDK timeout plus ~15s of
// backoff sleeps is ~4 minutes worst case. Five minutes covers that and stays far below the
// 900s pg-boss handler limit, so a stalled batch fails with a named error instead of expiring.
export const SP_API_SYNC_BATCH_DEADLINE_MS = 5 * 60 * 1000;
type ProcessSpApiSyncQueueFailureStage = 'fetch' | 'persist' | 'delete_queue';
const processSpApiSyncQueueJobDeps = { createEventLogSafe };

interface ProcessSpApiSyncQueueDeps {
    getSpApiSyncQueueItems: typeof getSpApiSyncQueueItems;
    searchCatalogItemsByAsins: typeof searchCatalogItemsByAsins;
    persistProductSyncResults: typeof persistProductSyncResults;
    deleteSpApiSyncQueueItems: typeof deleteSpApiSyncQueueItems;
    createEventLogsSafe: typeof createEventLogsSafe;
    notifyProductSyncCompleted: typeof notifyProductSyncCompleted;
    batchDeadlineMs?: number;
}

const defaultProcessSpApiSyncQueueDeps: ProcessSpApiSyncQueueDeps = {
    getSpApiSyncQueueItems,
    searchCatalogItemsByAsins,
    persistProductSyncResults,
    deleteSpApiSyncQueueItems,
    createEventLogsSafe,
    notifyProductSyncCompleted,
};

export const processSpApiSyncQueue = async (
    deps: ProcessSpApiSyncQueueDeps = defaultProcessSpApiSyncQueueDeps
) => {
    const queueItems = await deps.getSpApiSyncQueueItems(SP_API_SYNC_BATCH_SIZE + 1);
    if (queueItems.length === 0) {
        return {
            didWork: false,
            marketplaceId: null,
            queueCount: 0,
            upsertedCount: 0,
            deletedCount: 0,
            hasMore: false,
        } satisfies ProcessSpApiSyncQueueResult;
    }

    let hasMore = queueItems.length > SP_API_SYNC_BATCH_SIZE;
    const queueItemsToProcess = hasMore ? queueItems.slice(0, SP_API_SYNC_BATCH_SIZE) : queueItems;
    const marketplaceId = queueItemsToProcess[0].marketplaceId;
    const identities = queueItemsToProcess.map(item => ({
        marketplaceId: item.marketplaceId,
        asin: item.asin,
    }));
    const itemIds = queueItemsToProcess.map(item => item.id);
    let fetchedProducts: Awaited<ReturnType<typeof searchCatalogItemsByAsins>> = [];
    let failureStage: ProcessSpApiSyncQueueFailureStage = 'fetch';

    try {
        const result = await resolveProductDetails(
            identities,
            {
                searchCatalogItemsByAsins: deps.searchCatalogItemsByAsins,
                persistProductSyncResults: async input => {
                    failureStage = 'persist';
                    await deps.persistProductSyncResults(
                        input satisfies PersistProductSyncResultsInput
                    );
                },
            },
            undefined,
            deps.batchDeadlineMs ?? SP_API_SYNC_BATCH_DEADLINE_MS
        );
        fetchedProducts = result.products;

        failureStage = 'delete_queue';
        await deps.deleteSpApiSyncQueueItems(itemIds);
        for (const identity of identities) {
            deps.notifyProductSyncCompleted(identity);
        }
    } catch (caught) {
        const error = toSyncBatchError(
            caught,
            deps.batchDeadlineMs ?? SP_API_SYNC_BATCH_DEADLINE_MS
        );
        if (error !== caught && error instanceof Error) {
            console.error(`[SP-API Sync Queue] ${error.message}`, { asins: identities.length });
        }
        await logFailedQueueItems({
            queueItems: queueItemsToProcess,
            stage: failureStage,
            error,
            createEventLogs: deps.createEventLogsSafe,
        });
        throw error;
    }

    const fetchedAsins = new Set(fetchedProducts.map(product => product.asin));
    const deletedItems = queueItemsToProcess.filter(item => !fetchedAsins.has(item.asin));
    await deps.createEventLogsSafe([
        ...fetchedProducts.map(product => buildProductSyncedLog(product)),
        ...deletedItems.map(item => buildProductDeletedLog(item)),
    ]);

    if (!hasMore) {
        hasMore = (await deps.getSpApiSyncQueueItems(1)).length > 0;
    }

    return {
        didWork: true,
        marketplaceId,
        queueCount: queueItemsToProcess.length,
        upsertedCount: fetchedProducts.length,
        deletedCount: deletedItems.length,
        hasMore,
    } satisfies ProcessSpApiSyncQueueResult;
};

export const processSpApiSyncQueueJob = defineJob('process-spapi-sync-queue', {
    persistSuccess: 'didWork',
    startupSummary: 'event-driven, singleton + startup kick',
})
    .input(z.record(z.string(), z.unknown()))
    .options({ singletonKey: 'process-spapi-sync-queue', retryLimit: 0 })
    .work(async (job, _signal, log) => {
        let outcome: 'completed' | 'failed' = 'completed';

        try {
            const result = await processSpApiSyncQueue();
            if (result.didWork) {
                log('Processed SP-API sync queue batch', result);
            }
            if (result.hasMore) {
                await sendProcessSpApiSyncQueueJob({ singleton: false });
            }
            return result;
        } catch (error) {
            outcome = 'failed';
            await processSpApiSyncQueueJobDeps.createEventLogSafe({
                level: 'error',
                status: 'failed',
                category: 'job',
                action: 'job.fatal',
                primitiveType: 'job',
                message: 'Fatal job failure in process-spapi-sync-queue.',
                detailsJson: {
                    error: getErrorMessage(error),
                    input: job.data,
                    source: 'process_spapi_sync_queue_job',
                },
                jobName: 'process-spapi-sync-queue',
                jobRunId: String(job.id),
                requestId: String(job.id),
            });
            throw error;
        } finally {
            log('Finished SP-API sync queue job run', { jobId: job.id, outcome });
        }
    });

export class SpApiSyncBatchDeadlineError extends Error {
    constructor(deadlineMs: number) {
        super(
            `SP-API sync queue batch did not finish within ${deadlineMs}ms; the Catalog Search path (catalog.searchCatalogItems limiter or provider) is stalled.`
        );
        this.name = 'SpApiSyncBatchDeadlineError';
    }
}

// Unwraps public-retrieval retry errors into the specific stall so job logs name the limiter.
const toSyncBatchError = (error: unknown, deadlineMs: number) => {
    if (!(error instanceof RetrievalRetryableError)) {
        return error;
    }
    if (error.cause instanceof SpApiLimiterWaitError) {
        return error.cause;
    }
    if (error.reason === 'deadline') {
        return new SpApiSyncBatchDeadlineError(deadlineMs);
    }
    return error;
};

const logFailedQueueItems = async ({
    queueItems,
    stage,
    error,
    createEventLogs,
}: {
    queueItems: Array<{ marketplaceId: string; asin: string }>;
    stage: ProcessSpApiSyncQueueFailureStage;
    error: unknown;
    createEventLogs: typeof createEventLogsSafe;
}) => {
    await createEventLogs(
        queueItems.map(item => ({
            level: 'error' as const,
            status: 'failed' as const,
            category: 'product',
            action: 'product.sync',
            primitiveType: 'product' as const,
            message: `Product sync failed for ${item.asin}.`,
            detailsJson: {
                marketplaceId: item.marketplaceId,
                asin: item.asin,
                error: getErrorMessage(error),
                stage,
                source: 'spapi_sync_queue_job',
            },
            primitiveId: item.asin,
            marketplaceId: item.marketplaceId,
            asin: item.asin,
        }))
    );
};

const buildProductSyncedLog = ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => ({
    level: 'info' as const,
    status: 'success' as const,
    category: 'product',
    action: 'product.sync',
    primitiveType: 'product' as const,
    message: `Synced product ${asin}.`,
    detailsJson: { marketplaceId, asin, source: 'spapi_sync_queue_job' },
    primitiveId: asin,
    marketplaceId,
    asin,
});

const buildProductDeletedLog = ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => ({
    level: 'info' as const,
    status: 'success' as const,
    category: 'product',
    action: 'product.sync',
    primitiveType: 'product' as const,
    message: `Resolved Amazon listing ${asin} as deleted.`,
    detailsJson: {
        marketplaceId,
        asin,
        reason: 'empty_provider_response',
        source: 'spapi_sync_queue_job',
    },
    primitiveId: asin,
    marketplaceId,
    asin,
});
