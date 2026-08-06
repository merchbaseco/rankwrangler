import { resolveCatalogSearchRequest } from '@/db/catalog-search';
import { getCatalogSearchRun } from '@/db/catalog-search-history';
import { getOperationById } from '@/db/operations';
import {
    CATALOG_SEARCH_DEFAULT_MAX_AGE_SECONDS,
    CatalogSearchBillingError,
    type CatalogSearchOperation,
    dispatchCatalogSearchOperation,
    normalizeCatalogDisplayTerm,
} from '@/services/catalog-search';
import type { OperationRecord } from '@/services/operations';
import {
    coordinateRetrieval,
    RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
    RetrievalRetryableError,
} from '@/services/retrieval-coordinator';

const CATALOG_SEARCH_WORK_TIMEOUT_MS = 5 * 60 * 1000;
const CATALOG_SEARCH_RETRY_AFTER_SECONDS = 5 * 60;
const CATALOG_SEARCH_POLL_INTERVAL_MS = 2 * 1000;

type CatalogSearchResolution = Awaited<ReturnType<typeof resolveCatalogSearchRequest>>;
type CatalogSearchRun = NonNullable<Awaited<ReturnType<typeof getCatalogSearchRun>>>;

const sleep = async (delayMs: number) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
};

export interface CatalogSearchRetrievalDeps {
    resolveRequest: (
        input: Parameters<typeof resolveCatalogSearchRequest>[0]
    ) => Promise<CatalogSearchResolution>;
    getRun: (runId: string) => Promise<CatalogSearchRun | null>;
    getOperationById: (operationId: string) => Promise<OperationRecord | null>;
    dispatchOperation: (operation: CatalogSearchOperation) => Promise<boolean>;
    sleep: (delayMs: number) => Promise<void>;
    now?: () => Date;
}

const defaultDeps: CatalogSearchRetrievalDeps = {
    resolveRequest: resolveCatalogSearchRequest,
    getRun: getCatalogSearchRun,
    getOperationById,
    dispatchOperation: dispatchCatalogSearchOperation,
    sleep,
};

export const awaitCatalogSearchRetrieval = async (
    {
        term,
        refresh = false,
        serviceAccountId,
        ownerMerchbaseUserId,
        signal,
        timeoutMs = RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
        now = new Date(),
    }: {
        term: string;
        refresh?: boolean;
        serviceAccountId: string;
        ownerMerchbaseUserId: string;
        signal?: AbortSignal;
        timeoutMs?: number;
        now?: Date;
    },
    deps: CatalogSearchRetrievalDeps = defaultDeps
) => {
    const displayTerm = normalizeCatalogDisplayTerm(term);
    const key = buildCatalogSearchKey(displayTerm);
    const prepared = await coordinateRetrieval({
        key: `${key}:ensure`,
        work: async () => {
            const resolution = await deps.resolveRequest({
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: displayTerm.toLowerCase(),
                displayTerm,
                page: 0,
                maxAgeSeconds: CATALOG_SEARCH_DEFAULT_MAX_AGE_SECONDS,
                trigger: 'requested',
                serviceAccountId,
                ownerMerchbaseUserId,
                priority: 'interactive',
                now,
            });

            if (resolution.kind === 'billingRejected') {
                throw new CatalogSearchBillingError(resolution.reason, resolution.usageLimit);
            }
            if (resolution.kind !== 'pending') {
                return resolution;
            }
            if (resolution.operation.type !== 'catalogSearch') {
                throw new Error(`Operation ${resolution.operation.id} is not a Catalog search.`);
            }
            if (!(resolution.operation.dispatchedAt || resolution.operation.startedAt)) {
                const dispatched = await deps.dispatchOperation(resolution.operation);
                if (!dispatched && (refresh || !resolution.staleRunId)) {
                    throw new RetrievalRetryableError(
                        'Product search is temporarily unavailable. Retry shortly.',
                        {
                            retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
                            reason: 'capacity',
                        }
                    );
                }
            }
            return resolution;
        },
    });

    if (prepared.kind === 'ready') {
        return await buildSearchResponse(prepared.runId, now, deps);
    }
    if (prepared.kind === 'cooldown') {
        if (!refresh && prepared.staleRunId) {
            const staleRun = await deps.getRun(prepared.staleRunId);
            if (staleRun) {
                return buildSearchResponseFromRun(staleRun, now);
            }
        }
        throw new RetrievalRetryableError(
            'Product search is temporarily unavailable. Retry shortly.',
            {
                retryAfterSeconds: prepared.retryAfterSeconds,
                reason: 'capacity',
            }
        );
    }
    if (prepared.kind !== 'pending' || prepared.operation.type !== 'catalogSearch') {
        throw new Error('Catalog search resolution did not produce pending work.');
    }

    if (!refresh && prepared.staleRunId) {
        const staleRun = await deps.getRun(prepared.staleRunId);
        if (staleRun) {
            return buildSearchResponseFromRun(staleRun, now);
        }
    }

    const runId = await coordinateRetrieval({
        key: `${key}:completion`,
        signal,
        timeoutMs,
        retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
        retryMessage: 'Product search is temporarily unavailable. Retry shortly.',
        work: async () => await waitForCatalogSearchRun(prepared.operation.id, deps),
    });
    return await buildSearchResponse(runId, now, deps);
};

const buildSearchResponse = async (runId: string, now: Date, deps: CatalogSearchRetrievalDeps) => {
    const run = await deps.getRun(runId);
    if (!run) {
        throw new RetrievalRetryableError(
            'Product search is temporarily unavailable. Retry shortly.',
            { retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS, reason: 'capacity' }
        );
    }
    return buildSearchResponseFromRun(run, now);
};

const buildSearchResponseFromRun = (run: CatalogSearchRun, now: Date) => ({
    status: 'ready' as const,
    run,
    freshness: {
        stale:
            Date.parse(run.sourceCompletedAt) <
            now.getTime() - CATALOG_SEARCH_DEFAULT_MAX_AGE_SECONDS * 1000,
        updatedAt: run.sourceCompletedAt,
    },
});

const waitForCatalogSearchRun = async (operationId: string, deps: CatalogSearchRetrievalDeps) => {
    const deadline = (deps.now?.() ?? new Date()).getTime() + CATALOG_SEARCH_WORK_TIMEOUT_MS;

    while ((deps.now?.() ?? new Date()).getTime() < deadline) {
        const operation = await deps.getOperationById(operationId);
        if (!operation || operation.type !== 'catalogSearch') {
            throw new RetrievalRetryableError(
                'Product search is temporarily unavailable. Retry shortly.',
                { retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS, reason: 'capacity' }
            );
        }
        if (operation.status === 'completed') {
            return resolveCompletedCatalogSearch(operation);
        }
        await deps.sleep(CATALOG_SEARCH_POLL_INTERVAL_MS);
    }

    throw new RetrievalRetryableError('Product search is temporarily unavailable. Retry shortly.', {
        retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
        reason: 'deadline',
    });
};

const resolveCompletedCatalogSearch = (
    operation: Extract<OperationRecord, { type: 'catalogSearch' }>
) => {
    if (!operation.error && operation.resource?.type === 'catalogSearchRun') {
        return operation.resource.runId;
    }
    throw new RetrievalRetryableError('Product search is temporarily unavailable. Retry shortly.', {
        retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
        reason: 'capacity',
    });
};

const buildCatalogSearchKey = (displayTerm: string) =>
    `catalog:keepa:ATVPDKIKX0DER:${displayTerm.toLowerCase()}:0:search-run`;
