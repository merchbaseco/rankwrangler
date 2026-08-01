import { z } from 'zod';
import {
    claimOperationWork,
    completeOperationWithError,
    releaseOperationWork,
} from '@/db/operations';
import { defineJob } from '@/jobs/job-router.js';
import { evaluateUserOwnedJobAccess } from '@/services/access/job-access';
import { createEventLogSafe } from '@/services/event-logs.js';
import { loadKeepaProductHistoryManually } from '@/services/keepa-manual-load.js';
import { sanitizeOperationError } from '@/services/operations.js';
import { PRODUCT_HISTORY_OPERATION_JOB_NAME } from '@/services/product-history-operations.js';
import { notifyProductHistoryRefreshCompleted } from '@/services/product-history-refresh-events';

const refreshProductHistoryOperationInput = z.object({
    operationId: z.string().uuid(),
});

export type ProductHistoryOperationWorkerDeps = {
    claimOperationWork: typeof claimOperationWork;
    loadHistory: typeof loadKeepaProductHistoryManually;
    completeWithError: typeof completeOperationWithError;
    releaseOperationWork?: typeof releaseOperationWork;
    evaluateAccess?: typeof evaluateUserOwnedJobAccess;
    createEventLogSafe: typeof createEventLogSafe;
    notifyCompleted: typeof notifyProductHistoryRefreshCompleted;
};

const defaultDeps: ProductHistoryOperationWorkerDeps = {
    claimOperationWork,
    loadHistory: loadKeepaProductHistoryManually,
    completeWithError: completeOperationWithError,
    releaseOperationWork,
    evaluateAccess: evaluateUserOwnedJobAccess,
    createEventLogSafe,
    notifyCompleted: notifyProductHistoryRefreshCompleted,
};

export const runProductHistoryOperation = async (
    operationId: string,
    deps: ProductHistoryOperationWorkerDeps = defaultDeps
) => {
    const operation = await deps.claimOperationWork(operationId);
    if (!operation) {
        return {
            didWork: false,
            status: 'already_completed_or_active',
        } as const;
    }
    if (operation.type !== 'productHistoryRefresh') {
        throw new Error(`Operation ${operationId} is not a Product-history refresh.`);
    }

    if (!operation.input.ownerMerchbaseUserId) {
        await deps.releaseOperationWork?.(operationId);
        return { didWork: false, status: 'skipped_access_unavailable' } as const;
    }

    const access = await (deps.evaluateAccess ?? evaluateUserOwnedJobAccess)(
        operation.input.ownerMerchbaseUserId
    );
    if (access.kind === 'unavailable') {
        await deps.releaseOperationWork?.(operationId);
        return { didWork: false, status: 'skipped_access_unavailable' } as const;
    }
    if (access.kind === 'denied') {
        await deps.completeWithError({
            operationId,
            error: {
                code: 'ACCESS_DENIED',
                message: 'RankWrangler access is no longer granted.',
            },
        });
        deps.notifyCompleted({
            operationId,
            marketplaceId: operation.input.marketplaceId,
            asin: operation.input.asin,
        });
        return { didWork: true, status: 'skipped_access_denied' } as const;
    }

    try {
        await deps.loadHistory({
            marketplaceId: operation.input.marketplaceId,
            asin: operation.input.asin,
            days: operation.input.days,
            operationId,
        });
        await deps.createEventLogSafe({
            level: 'info',
            status: 'success',
            category: 'history',
            action: 'history.sync.manual',
            primitiveType: 'history',
            message: `Collected history for ${operation.input.asin}.`,
            detailsJson: {
                operationId,
                marketplaceId: operation.input.marketplaceId,
                source: 'product_history_operation',
            },
            primitiveId: operation.input.asin,
            marketplaceId: operation.input.marketplaceId,
            asin: operation.input.asin,
            requestId: operationId,
        });
        deps.notifyCompleted({
            operationId,
            marketplaceId: operation.input.marketplaceId,
            asin: operation.input.asin,
        });

        return { didWork: true, status: 'completed' } as const;
    } catch (error) {
        await deps.completeWithError({
            operationId,
            error: sanitizeOperationError(error),
        });
        await deps.createEventLogSafe({
            level: 'error',
            status: 'failed',
            category: 'history',
            action: 'history.sync.manual',
            primitiveType: 'history',
            message: `History collection failed for ${operation.input.asin}.`,
            detailsJson: {
                operationId,
                marketplaceId: operation.input.marketplaceId,
                source: 'product_history_operation',
            },
            primitiveId: operation.input.asin,
            marketplaceId: operation.input.marketplaceId,
            asin: operation.input.asin,
            requestId: operationId,
        });
        deps.notifyCompleted({
            operationId,
            marketplaceId: operation.input.marketplaceId,
            asin: operation.input.asin,
        });

        return { didWork: true, status: 'failed' } as const;
    }
};

export const refreshProductHistoryOperationJob = defineJob(PRODUCT_HISTORY_OPERATION_JOB_NAME, {
    persistSuccess: 'didWork',
    startupSummary: 'event-driven durable Operation worker',
})
    .input(refreshProductHistoryOperationInput)
    .options({ retryLimit: 0 })
    .work(async job => {
        return await runProductHistoryOperation(job.data.operationId);
    });
