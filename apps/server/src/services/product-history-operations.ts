import type { PgBoss } from 'pg-boss';
import {
    claimOperationDispatch,
    ensurePendingProductHistoryOperation,
    listStalePendingProductHistoryOperations,
    releaseOperationDispatch,
} from '@/db/operations.js';
import { buildPublicOperation, type OperationRecord } from '@/services/operations.js';

export const PRODUCT_HISTORY_OPERATION_JOB_NAME = 'refresh-product-history-operation';
export const PRODUCT_HISTORY_RETRY_AFTER_SECONDS = 2;
const PRODUCT_HISTORY_DISPATCH_COOLDOWN_MS = PRODUCT_HISTORY_RETRY_AFTER_SECONDS * 1000;

let productHistoryOperationBoss: PgBoss | null = null;

export interface ProductHistoryOperationDeps {
    ensurePendingOperation: typeof ensurePendingProductHistoryOperation;
    claimOperationDispatch: typeof claimOperationDispatch;
    releaseOperationDispatch: typeof releaseOperationDispatch;
    listStalePendingOperations: typeof listStalePendingProductHistoryOperations;
    sendJob: (input: { operationId: string }) => Promise<string | null>;
    now?: () => Date;
}

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
    now: () => new Date(),
};

export const registerProductHistoryOperationWakeups = (boss: PgBoss) => {
    productHistoryOperationBoss = boss;
};

export const ensureProductHistoryWork = async (
    {
        marketplaceId,
        asin,
        ownerMerchbaseUserId,
    }: {
        marketplaceId: string;
        asin: string;
        ownerMerchbaseUserId: string;
    },
    deps: ProductHistoryOperationDeps = defaultDeps
) => {
    const ensured = await deps.ensurePendingOperation({
        marketplaceId,
        asin,
        ownerMerchbaseUserId,
    });
    const now = deps.now?.() ?? new Date();
    const dispatchDue =
        ensured.created ||
        Boolean(ensured.operation.dispatchedAt) ||
        Boolean(ensured.operation.startedAt) ||
        now.getTime() - ensured.operation.updatedAt.getTime() >=
            PRODUCT_HISTORY_DISPATCH_COOLDOWN_MS;
    const dispatched = dispatchDue
        ? await dispatchPendingOperation(ensured.operation, deps, true)
        : false;

    return {
        ...ensured,
        dispatched,
    };
};

export const requestProductHistoryRefresh = async (
    input: {
        marketplaceId: string;
        asin: string;
        ownerMerchbaseUserId: string;
    },
    deps: ProductHistoryOperationDeps = defaultDeps
) => {
    const ensured = await ensureProductHistoryWork(input, deps);
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
    deps: ProductHistoryOperationDeps,
    joinedWorkCountsAsDispatched = false
) => {
    const claimed = await deps.claimOperationDispatch(operation.id);
    if (!claimed) {
        return joinedWorkCountsAsDispatched;
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
