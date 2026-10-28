import { z } from 'zod';
import {
    completeCatalogSearchOperationWithError,
    releaseCatalogSearchWork,
} from '@/db/catalog-search-operations';
import { claimOperationWork } from '@/db/operations';
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
import { KeepaCapacityDeferredError } from '@/services/providers/keepa/keepa-capacity-types';
import { getErrorMessage } from '@/services/job-executions-utils';
import { TRPCError } from '@trpc/server';
import { defineJob } from './job-router';

const catalogSearchJobInput = z.object({
    operationId: z.string().uuid(),
});
const CATALOG_ASIN_PATTERN = /^[A-Z0-9]{10}$/i;

export interface CatalogSearchWorkerDeps {
    claimOperationWork: typeof claimOperationWork;
    searchProvider: typeof searchKeepaCatalog;
    persistSuccess: typeof persistCatalogSearchSuccess;
    completeWithError: typeof completeCatalogSearchOperationWithError;
    releaseOperationWork?: typeof releaseCatalogSearchWork;
    evaluateAccess?: typeof evaluateUserOwnedJobAccess;
    notifyCompleted: typeof notifyCatalogSearchCompleted;
}

const defaultDeps: CatalogSearchWorkerDeps = {
    claimOperationWork,
    searchProvider: searchKeepaCatalog,
    persistSuccess: persistCatalogSearchSuccess,
    releaseOperationWork: releaseCatalogSearchWork,
    evaluateAccess: evaluateUserOwnedJobAccess,
    notifyCompleted: notifyCatalogSearchCompleted,
    completeWithError: completeCatalogSearchOperationWithError,
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
        await (operation.startedAt
            ? deps.releaseOperationWork?.(operationId, operation.startedAt)
            : deps.releaseOperationWork?.(operationId));
        return { didWork: false, status: 'skipped_access_unavailable' } as const;
    }

    const access = await (deps.evaluateAccess ?? evaluateUserOwnedJobAccess)(
        input.ownerMerchbaseUserId
    );
    if (access.kind === 'unavailable') {
        await (operation.startedAt
            ? deps.releaseOperationWork?.(operationId, operation.startedAt)
            : deps.releaseOperationWork?.(operationId));
        return { didWork: false, status: 'skipped_access_unavailable' } as const;
    }
    if (access.kind === 'denied') {
        await deps.completeWithError({
            operationId,
            startedAt: operation.startedAt ?? undefined,
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
            workClass: input.workClass,
            keywordId: input.queryId,
            workId: operationId,
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
            page: input.page,
            startedAt: operation.startedAt ?? undefined,
            sourceStartedAt,
            sourceCompletedAt,
            trigger: input.trigger,
            results,
            internalUsage: providerResult.internalUsage,
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
        if (error instanceof KeepaCapacityDeferredError) {
            await deps.releaseOperationWork?.(
                operationId,
                operation.startedAt ?? undefined,
                error.retryAt
            );
            return { didWork: false, status: 'deferred_capacity' } as const;
        }
        const operationError = sanitizeOperationError(error, 'catalogSearch');
        await deps.completeWithError({
            operationId,
            startedAt: operation.startedAt ?? undefined,
            error: operationError,
        });
        deps.notifyCompleted({
            operationId,
            queryId: input.queryId,
        });
        // The Operation keeps the sanitized public error; the admin-only run record keeps a cause:
        // provider errors by code only (their text can echo provider payloads), anything else with
        // its message, so failures such as database timeouts are diagnosable.
        const cause = failureCause(error);
        console.error('[Job][catalog-search] Catalog search failed', { operationId, cause });
        return { didWork: true, status: 'failed', cause } as const;
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

// A database failure arrives wrapped: its message is the SQL text and the reason (Postgres code,
// message, constraint) sits on `cause`, so the deepest cause is what gets recorded.
const failureCause = (error: unknown) => {
    if (error instanceof TRPCError) return `TRPCError ${error.code}`;
    let root = error;
    while (root instanceof Error && root.cause !== undefined) root = root.cause;
    const name = root instanceof Error ? root.name : typeof root;
    const fields = root && typeof root === 'object' ? (root as Record<string, unknown>) : {};
    const code = fields.code === undefined ? '' : ` ${String(fields.code)}`;
    const detail = ['constraint_name', 'column_name', 'detail']
        .filter(key => typeof fields[key] === 'string')
        .map(key => ` ${key}=${String(fields[key])}`)
        .join('');
    return `${name}${code}: ${getErrorMessage(root).slice(0, 300)}${detail}`.slice(0, 600);
};
