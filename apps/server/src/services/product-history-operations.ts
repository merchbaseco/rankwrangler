import type { PgBoss } from 'pg-boss';
import {
    claimOperationDispatch,
    ensurePendingProductHistoryOperation,
    listStalePendingProductHistoryOperations,
    releaseOperationDispatch,
} from '@/db/operations.js';
import { buildPublicOperation, type OperationRecord } from '@/services/operations.js';

export const PRODUCT_HISTORY_OPERATION_JOB_NAME = 'refresh-product-history-operation';

let productHistoryOperationBoss: PgBoss | null = null;

export type ProductHistoryOperationDeps = {
    ensurePendingOperation: typeof ensurePendingProductHistoryOperation;
    claimOperationDispatch: typeof claimOperationDispatch;
    releaseOperationDispatch: typeof releaseOperationDispatch;
    listStalePendingOperations: typeof listStalePendingProductHistoryOperations;
    sendJob: (input: { operationId: string }) => Promise<string | null>;
};

const defaultDeps: ProductHistoryOperationDeps = {
    ensurePendingOperation: ensurePendingProductHistoryOperation,
    claimOperationDispatch,
    releaseOperationDispatch,
    listStalePendingOperations: listStalePendingProductHistoryOperations,
    sendJob: async ({ operationId }) => {
        if (!productHistoryOperationBoss) {
            throw new Error('Product-history Operation queue is not initialized.');
        }

        return (
            (await productHistoryOperationBoss.send(
                PRODUCT_HISTORY_OPERATION_JOB_NAME,
                { operationId },
                {
                    retryLimit: 0,
                    singletonKey: `${PRODUCT_HISTORY_OPERATION_JOB_NAME}:${operationId}`,
                }
            )) ?? null
        );
    },
};

export const registerProductHistoryOperationWakeups = (boss: PgBoss) => {
    productHistoryOperationBoss = boss;
};

export const requestProductHistoryRefresh = async (
    {
        marketplaceId,
        asin,
    }: {
        marketplaceId: string;
        asin: string;
    },
    deps: ProductHistoryOperationDeps = defaultDeps
) => {
    const ensured = await deps.ensurePendingOperation({ marketplaceId, asin });
    await dispatchPendingOperation(ensured.operation, deps);

    return {
        operation: buildPublicOperation(ensured.operation),
        created: ensured.created,
    };
};

export const recoverStaleProductHistoryOperations = async (
    deps: ProductHistoryOperationDeps = defaultDeps
) => {
    const staleOperations = await deps.listStalePendingOperations();
    let dispatchedCount = 0;

    for (const operation of staleOperations) {
        if (await dispatchPendingOperation(operation, deps)) {
            dispatchedCount += 1;
        }
    }

    return dispatchedCount;
};

const dispatchPendingOperation = async (
    operation: OperationRecord,
    deps: ProductHistoryOperationDeps
) => {
    const claimed = await deps.claimOperationDispatch(operation.id);
    if (!claimed) {
        return false;
    }

    try {
        const jobId = await deps.sendJob({ operationId: operation.id });
        if (!jobId) {
            throw new Error('Product-history Operation queue did not acknowledge the job.');
        }
        return true;
    } catch (error) {
        await deps.releaseOperationDispatch(operation.id);
        console.error(`[Operations] Failed to dispatch ${operation.id}:`, error);
        return false;
    }
};
