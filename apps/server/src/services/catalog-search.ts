import type { PgBoss } from 'pg-boss';
import { resolveCatalogSearchRequest } from '@/db/catalog-search';
import { claimOperationDispatch, releaseOperationDispatch } from '@/db/operations';
import { listStalePendingCatalogSearchOperations } from '@/db/catalog-search-operations';
import { getCatalogSearchRun } from '@/db/catalog-search-history';
import { buildPublicOperation, type OperationRecord } from './operations';

export const CATALOG_SEARCH_JOB_NAME = 'catalog-search';
export const CATALOG_SEARCH_DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

let catalogSearchBoss: PgBoss | null = null;

type CatalogSearchResolution = Awaited<ReturnType<typeof resolveCatalogSearchRequest>>;
type CatalogSearchRun = NonNullable<Awaited<ReturnType<typeof getCatalogSearchRun>>>;
export type CatalogSearchOperation = Extract<OperationRecord, { type: 'catalogSearch' }>;

export type CatalogSearchDeps = {
    resolveRequest: (input: Parameters<typeof resolveCatalogSearchRequest>[0]) => Promise<
        CatalogSearchResolution
    >;
    getRun: (runId: string) => Promise<CatalogSearchRun | null>;
    dispatchOperation: (operation: CatalogSearchOperation) => Promise<boolean>;
};

const defaultDeps: CatalogSearchDeps = {
    resolveRequest: resolveCatalogSearchRequest,
    getRun: getCatalogSearchRun,
    dispatchOperation: operation => dispatchCatalogSearchOperation(operation),
};

export class CatalogSearchBillingError extends Error {
    readonly reason: 'licenseNotFound' | 'usageLimitExceeded';

    constructor(
        reason: 'licenseNotFound' | 'usageLimitExceeded',
        usageLimit: number | null
    ) {
        const message =
            reason === 'usageLimitExceeded'
                ? `Daily limit of ${usageLimit ?? 0} requests exceeded. Resets at midnight UTC.`
                : 'Valid license key required';
        super(message);
        this.name = 'CatalogSearchBillingError';
        this.reason = reason;
    }
}

export const registerCatalogSearchWakeups = (boss: PgBoss) => {
    catalogSearchBoss = boss;
};

export const requestCatalogSearch = async (
    {
        term,
        maxAgeSeconds = CATALOG_SEARCH_DEFAULT_MAX_AGE_SECONDS,
        licenseId,
    }: {
        term: string;
        maxAgeSeconds?: number;
        licenseId?: string;
    },
    deps: CatalogSearchDeps = defaultDeps
) => {
    const displayTerm = normalizeCatalogDisplayTerm(term);
    const resolution = await deps.resolveRequest({
        source: 'keepa',
        marketplaceId: 'ATVPDKIKX0DER',
        normalizedTerm: displayTerm.toLowerCase(),
        displayTerm,
        page: 0,
        maxAgeSeconds,
        licenseId,
        priority: 'interactive',
    });

    if (resolution.kind === 'ready') {
        const run = await deps.getRun(resolution.runId);
        if (!run) {
            throw new Error(`Reusable Catalog Search run ${resolution.runId} was not found.`);
        }
        return {
            response: {
                status: 'ready' as const,
                run,
            },
            startedWork: false,
        };
    }

    if (resolution.kind === 'billingRejected') {
        throw new CatalogSearchBillingError(resolution.reason, resolution.usageLimit);
    }
    if (resolution.operation.type !== 'catalogSearch') {
        throw new Error(`Operation ${resolution.operation.id} is not a Catalog search.`);
    }
    await deps.dispatchOperation(resolution.operation);
    return {
        response: {
            status: 'pending' as const,
            operation: buildPublicOperation(resolution.operation),
        },
        startedWork: resolution.created,
    };
};

export const dispatchCatalogSearchOperation = async (operation: CatalogSearchOperation) => {
    const claimed = await claimOperationDispatch(operation.id);
    if (!claimed) {
        return false;
    }

    try {
        if (!catalogSearchBoss) {
            throw new Error('Catalog-search Operation queue is not initialized.');
        }
        const jobId = await catalogSearchBoss.send(
            CATALOG_SEARCH_JOB_NAME,
            { operationId: operation.id },
            {
                retryLimit: 0,
                priority: operation.input.priority === 'interactive' ? 10 : 5,
                singletonKey: `${CATALOG_SEARCH_JOB_NAME}:${operation.id}`,
            }
        );
        if (!jobId) {
            throw new Error('Catalog-search Operation queue did not acknowledge the job.');
        }
        return true;
    } catch (error) {
        await releaseOperationDispatch(operation.id);
        console.error(`[Catalog Search] Failed to dispatch ${operation.id}:`, error);
        return false;
    }
};

export const recoverStaleCatalogSearchOperations = async () => {
    const staleOperations = await listStalePendingCatalogSearchOperations();
    let dispatchedCount = 0;
    for (const operation of staleOperations) {
        if (operation.type !== 'catalogSearch') {
            throw new Error(`Operation ${operation.id} is not a Catalog search.`);
        }
        if (await dispatchCatalogSearchOperation(operation)) {
            dispatchedCount += 1;
        }
    }
    return dispatchedCount;
};

export const normalizeCatalogDisplayTerm = (term: string) => {
    return term.trim().replace(/\s+/g, ' ');
};
