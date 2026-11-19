import { resolveCatalogSearchRequest } from '@/db/catalog-search';
import { type CatalogSearchRunReadOptions, getCatalogSearchRun } from '@/db/catalog-search-history';
import { getOperationById } from '@/db/operations';
import {
    CATALOG_SEARCH_DEFAULT_MAX_AGE_SECONDS,
    CatalogSearchBillingError,
    type CatalogSearchOperation,
    dispatchCatalogSearchOperation,
    normalizeCatalogDisplayTerm,
} from '@/services/catalog-search';
import { subscribeToCatalogSearchCompleted } from '@/services/catalog-search-events';
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

/** The Amazon search run that answered: which run, when Amazon was searched, and how many hits. */
export interface CollectedKeywordHead {
    runId: string;
    searchedAt: string;
    resultCount: number;
}

// Polling is the fallback; the worker runs in this process and announces completion, which ends the
// wait at once.
const sleepUntilCompleted = async (delayMs: number, queryId: string) => {
    let unsubscribe = () => {};
    await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, delayMs);
        unsubscribe = subscribeToCatalogSearchCompleted({ queryId }, () => {
            clearTimeout(timer);
            resolve();
        });
    });
    unsubscribe();
};

export interface CatalogSearchRetrievalDeps {
    resolveRequest: (
        input: Parameters<typeof resolveCatalogSearchRequest>[0]
    ) => Promise<CatalogSearchResolution>;
    getRun: (
        runId: string,
        options?: CatalogSearchRunReadOptions
    ) => Promise<CatalogSearchRun | null>;
    getOperationById: (operationId: string) => Promise<OperationRecord | null>;
    dispatchOperation: (operation: CatalogSearchOperation) => Promise<boolean>;
    sleep: (delayMs: number, queryId: string) => Promise<void>;
    now?: () => Date;
}

const defaultDeps: CatalogSearchRetrievalDeps = {
    resolveRequest: resolveCatalogSearchRequest,
    getRun: getCatalogSearchRun,
    getOperationById,
    dispatchOperation: dispatchCatalogSearchOperation,
    sleep: sleepUntilCompleted,
};

export const awaitCatalogSearchRetrieval = async (
    {
        term,
        serviceAccountId,
        ownerMerchbaseUserId,
        signal,
        timeoutMs = RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
        now = new Date(),
    }: {
        term: string;
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
                serveStale: true,
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
                if (!dispatched) {
                    throw new RetrievalRetryableError(
                        'Keyword results are temporarily unavailable. Retry shortly.',
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
        return await buildSearchResponse(prepared.runId, 'last-known', signal, timeoutMs, deps);
    }
    // Stored evidence of any age answers at once with its searchedAt; resolution has already
    // queued its refresh as background work.
    if (prepared.staleRunId) {
        return await buildSearchResponse(prepared.staleRunId, 'last-known', signal, timeoutMs, deps);
    }
    if (prepared.kind === 'cooldown') {
        throw new RetrievalRetryableError(
            'Keyword results are temporarily unavailable. Retry shortly.',
            {
                retryAfterSeconds: prepared.retryAfterSeconds,
                reason: 'capacity',
            }
        );
    }
    if (prepared.kind !== 'pending' || prepared.operation.type !== 'catalogSearch') {
        throw new Error('Catalog search resolution did not produce pending work.');
    }

    const runId = await coordinateRetrieval({
        key: `${key}:completion`,
        signal,
        timeoutMs,
        retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
        retryMessage: 'Keyword results are temporarily unavailable. Retry shortly.',
        work: async () => await waitForCatalogSearchRun(prepared.operation, deps),
    });
    return await buildSearchResponse(runId, 'blocking', signal, timeoutMs, deps);
};

// A stored run's Products are known, so they answer last-known and refresh in the background; a
// fresh search may surface Products RankWrangler has never resolved, which it waits for, so the
// stored catalog holds them once this returns.
const buildSearchResponse = async (
    runId: string,
    fetchPolicy: 'blocking' | 'last-known',
    signal: AbortSignal | undefined,
    timeoutMs: number,
    deps: CatalogSearchRetrievalDeps
): Promise<CollectedKeywordHead> => {
    const run = await deps.getRun(runId, {
        fetchPolicy,
        signal,
        timeoutMs,
    });
    if (!run) {
        throw new RetrievalRetryableError(
            'Keyword results are temporarily unavailable. Retry shortly.',
            { retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS, reason: 'capacity' }
        );
    }
    return { runId: run.id, searchedAt: run.sourceCompletedAt, resultCount: run.resultCount };
};

const waitForCatalogSearchRun = async (
    { id: operationId, input: { queryId } }: CatalogSearchOperation,
    deps: CatalogSearchRetrievalDeps
) => {
    const deadline = (deps.now?.() ?? new Date()).getTime() + CATALOG_SEARCH_WORK_TIMEOUT_MS;

    while ((deps.now?.() ?? new Date()).getTime() < deadline) {
        const operation = await deps.getOperationById(operationId);
        if (!operation || operation.type !== 'catalogSearch') {
            throw new RetrievalRetryableError(
                'Keyword results are temporarily unavailable. Retry shortly.',
                { retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS, reason: 'capacity' }
            );
        }
        if (operation.status === 'completed') {
            return resolveCompletedCatalogSearch(operation);
        }
        await deps.sleep(CATALOG_SEARCH_POLL_INTERVAL_MS, queryId);
    }

    throw new RetrievalRetryableError(
        'Keyword results are temporarily unavailable. Retry shortly.',
        {
            retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
            reason: 'deadline',
        }
    );
};

const resolveCompletedCatalogSearch = (
    operation: Extract<OperationRecord, { type: 'catalogSearch' }>
) => {
    if (!operation.error && operation.resource?.type === 'catalogSearchRun') {
        return operation.resource.runId;
    }
    throw new RetrievalRetryableError(
        'Keyword results are temporarily unavailable. Retry shortly.',
        {
            retryAfterSeconds: CATALOG_SEARCH_RETRY_AFTER_SECONDS,
            reason: 'capacity',
        }
    );
};

const buildCatalogSearchKey = (displayTerm: string) =>
    `catalog:keepa:ATVPDKIKX0DER:${displayTerm.toLowerCase()}:0:search-run`;
