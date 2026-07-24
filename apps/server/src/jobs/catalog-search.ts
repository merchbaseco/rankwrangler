import { z } from 'zod';
import { claimOperationWork, completeOperationWithError } from '@/db/operations';
import {
    persistCatalogSearchSuccess,
    type CatalogSearchPersistenceResult,
} from '@/db/persist-catalog-search';
import { defineJob } from './job-router';
import { CATALOG_SEARCH_JOB_NAME } from '@/services/catalog-search';
import { searchKeepaCatalog } from '@/services/keepa-catalog-search';
import { normalizeKeepaProduct } from '@/services/keepa-product-normalizer';
import {
    sanitizeOperationError,
    type CatalogSearchOperationInput,
} from '@/services/operations';

const catalogSearchJobInput = z.object({
    operationId: z.string().uuid(),
});

export type CatalogSearchWorkerDeps = {
    claimOperationWork: typeof claimOperationWork;
    searchProvider: typeof searchKeepaCatalog;
    persistSuccess: typeof persistCatalogSearchSuccess;
    completeWithError: typeof completeOperationWithError;
};

const defaultDeps: CatalogSearchWorkerDeps = {
    claimOperationWork,
    searchProvider: searchKeepaCatalog,
    persistSuccess: persistCatalogSearchSuccess,
    completeWithError: completeOperationWithError,
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

    try {
        const providerResult = await deps.searchProvider({
            marketplaceId: input.marketplaceId,
            term: input.term,
        });
        const sourceCompletedAt = new Date();
        const results = normalizeSearchResults(
            input.marketplaceId,
            providerResult.products,
            sourceCompletedAt
        );
        await deps.persistSuccess({
            operationId,
            queryId: input.queryId,
            sourceStartedAt,
            sourceCompletedAt,
            results,
            internalUsage: providerResult.internalUsage,
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
        return { didWork: true, status: 'failed' } as const;
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
        if (!product.asin || !/^[A-Z0-9]{10}$/i.test(product.asin)) {
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
            continue;
        }
    }

    return Array.from(accepted.values());
};
