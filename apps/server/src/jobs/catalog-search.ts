import { z } from 'zod';
import {
    claimOperationWork,
    completeOperationWithError,
    releaseOperationWork,
} from '@/db/operations';
import {
    type CatalogSearchPersistenceResult,
    persistCatalogSearchSuccess,
} from '@/db/persist-catalog-search';
import { evaluateUserOwnedJobAccess } from '@/services/access/job-access';
import { CATALOG_SEARCH_JOB_NAME } from '@/services/catalog-search';
import { notifyCatalogSearchCompleted } from '@/services/catalog-search-events';
import { searchKeepaCatalog } from '@/services/keepa-catalog-search';
import { normalizeKeepaProduct } from '@/services/keepa-product-normalizer';
import { type CatalogSearchOperationInput, sanitizeOperationError } from '@/services/operations';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue';
import { defineJob } from './job-router';

const catalogSearchJobInput = z.object({
    operationId: z.string().uuid(),
});
const CATALOG_ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

export interface CatalogSearchWorkerDeps {
    claimOperationWork: typeof claimOperationWork;
    searchProvider: typeof searchKeepaCatalog;
    persistSuccess: typeof persistCatalogSearchSuccess;
    completeWithError: typeof completeOperationWithError;
    releaseOperationWork?: typeof releaseOperationWork;
    evaluateAccess?: typeof evaluateUserOwnedJobAccess;
    notifyCompleted: typeof notifyCatalogSearchCompleted;
    enqueueSyncItems: typeof enqueueSpApiSyncQueueItems;
    logEnqueueError: typeof console.error;
}

const defaultDeps: CatalogSearchWorkerDeps = {
    claimOperationWork,
    searchProvider: searchKeepaCatalog,
    persistSuccess: persistCatalogSearchSuccess,
    completeWithError: completeOperationWithError,
    releaseOperationWork,
    evaluateAccess: evaluateUserOwnedJobAccess,
    notifyCompleted: notifyCatalogSearchCompleted,
    enqueueSyncItems: enqueueSpApiSyncQueueItems,
    logEnqueueError: console.error,
};

export const runCatalogSearchOperation = async (
    operationId: string,
    deps: CatalogSearchWorkerDeps = defaultDeps
) => {
    const operation = await deps.claimOperationWork(operationId);
    if (!operation) {
        return { didWork: false, status: 'already_completed_or_active' } as const;
    }
    if (operation.type !== 'catalogSearch') {
        throw new Error(`Operation ${operationId} is not a Catalog search.`);
    }
    const input = operation.input as CatalogSearchOperationInput;
    const sourceStartedAt = new Date();

    if (input.priority === 'interactive' && !input.ownerMerchbaseUserId) {
        await deps.releaseOperationWork?.(operationId);
        return { didWork: false, status: 'skipped_access_unavailable' } as const;
    }

    const access = await (deps.evaluateAccess ?? evaluateUserOwnedJobAccess)(
        input.ownerMerchbaseUserId
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
            queryId: input.queryId,
        });
        return { didWork: true, status: 'skipped_access_denied' } as const;
    }

    try {
        const providerResult = await deps.searchProvider({
            marketplaceId: input.marketplaceId,
            term: input.term,
            priority: input.priority,
        });
        const sourceCompletedAt = new Date();
        const results = normalizeSearchResults(
            input.marketplaceId,
            providerResult.products,
            sourceCompletedAt
        );
        const persisted = await deps.persistSuccess({
            operationId,
            queryId: input.queryId,
            sourceStartedAt,
            sourceCompletedAt,
            trigger: input.trigger,
            results,
            internalUsage: providerResult.internalUsage,
        });
        await enqueueCatalogProductSyncCandidates({
            candidates: persisted.productSyncCandidates,
            enqueue: deps.enqueueSyncItems,
            logError: deps.logEnqueueError,
        });
        deps.notifyCompleted({
            operationId,
            queryId: input.queryId,
        });

        return {
            didWork: true,
            status: 'completed',
            resultCount: results.length,
        } as const;
    } catch (error) {
        await deps.completeWithError({
            operationId,
            error: sanitizeOperationError(error, 'catalogSearch'),
        });
        deps.notifyCompleted({
            operationId,
            queryId: input.queryId,
        });
        return { didWork: true, status: 'failed' } as const;
    }
};

const enqueueCatalogProductSyncCandidates = async ({
    candidates,
    enqueue,
    logError,
}: {
    candidates: Array<{ marketplaceId: string; asin: string }>;
    enqueue: typeof enqueueSpApiSyncQueueItems;
    logError: typeof console.error;
}) => {
    if (candidates.length === 0) {
        return;
    }

    try {
        await enqueue(candidates);
    } catch (error) {
        logError('[Catalog Search] Failed to enqueue Products for SP-API sync:', error);
    }
};

export const catalogSearchJob = defineJob(CATALOG_SEARCH_JOB_NAME, {
    persistSuccess: 'didWork',
    startupSummary: 'event-driven durable Catalog search worker',
})
    .input(catalogSearchJobInput)
    .options({ retryLimit: 0, priority: 10 })
    .work(async job => {
        return await runCatalogSearchOperation(job.data.operationId);
    });

const normalizeSearchResults = (
    marketplaceId: string,
    products: Awaited<ReturnType<typeof searchKeepaCatalog>>['products'],
    fetchedAt: Date
) => {
    const accepted = new Map<string, CatalogSearchPersistenceResult>();

    for (const [index, product] of products.entries()) {
        if (!(product.asin && CATALOG_ASIN_PATTERN.test(product.asin))) {
            continue;
        }
        const asin = product.asin.toUpperCase();
        if (accepted.has(asin)) {
            continue;
        }

        try {
            accepted.set(asin, {
                sourcePosition: index + 1,
                normalized: normalizeKeepaProduct({
                    marketplaceId,
                    product: { ...product, asin },
                    fetchedAt,
                }),
            });
        } catch {
            // Ignore malformed provider products; other results remain usable.
        }
    }

    return Array.from(accepted.values());
};
