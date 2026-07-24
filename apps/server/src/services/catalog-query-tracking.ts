import {
    listDueTrackedCatalogQueries,
    setCatalogQueryTracking,
} from '@/db/catalog-query-tracking';
import { resolveDueCatalogSearchRequest } from '@/db/catalog-search';
import {
    type CatalogSearchOperation,
    dispatchCatalogSearchOperation,
    normalizeCatalogDisplayTerm,
} from './catalog-search';

export const CATALOG_QUERY_TRACKING_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;
export const CATALOG_QUERY_TRACKING_RETRY_INTERVAL_MS = 60 * 60 * 1_000;

export const isCatalogQueryDue = ({
    trackedAt,
    latestSuccessfulRunAt,
    now,
}: {
    trackedAt: Date | null;
    latestSuccessfulRunAt: Date | null;
    now: Date;
}) => {
    if (!trackedAt) {
        return false;
    }
    if (!latestSuccessfulRunAt) {
        return true;
    }
    return now.getTime() - latestSuccessfulRunAt.getTime() >= CATALOG_QUERY_TRACKING_INTERVAL_MS;
};

type DueResolution = Awaited<ReturnType<typeof resolveDueCatalogSearchRequest>>;

export type CatalogQueryCollectionDeps = {
    listDueQueries: typeof listDueTrackedCatalogQueries;
    resolveDueRequest: (input: Parameters<typeof resolveDueCatalogSearchRequest>[0]) => Promise<
        DueResolution
    >;
    dispatchOperation: (operation: CatalogSearchOperation) => Promise<boolean>;
};

export type CatalogQueryTrackingUpdateDeps = {
    setTracking: typeof setCatalogQueryTracking;
};

const defaultCollectionDeps: CatalogQueryCollectionDeps = {
    listDueQueries: listDueTrackedCatalogQueries,
    resolveDueRequest: resolveDueCatalogSearchRequest,
    dispatchOperation: dispatchCatalogSearchOperation,
};

const defaultUpdateDeps: CatalogQueryTrackingUpdateDeps = {
    setTracking: setCatalogQueryTracking,
};

export const updateCatalogQueryTracking = async (
    {
        term,
        enabled,
        now = new Date(),
    }: {
        term: string;
        enabled: boolean;
        now?: Date;
    },
    deps: CatalogQueryTrackingUpdateDeps = defaultUpdateDeps
) => {
    const normalizedTerm = normalizeCatalogDisplayTerm(term).toLowerCase();
    const query = await deps.setTracking({ normalizedTerm, enabled, now });
    if (!query) {
        return null;
    }
    return {
        id: query.id,
        tracking: {
            enabled: query.trackedAt !== null,
            trackedAt: query.trackedAt?.toISOString() ?? null,
        },
    };
};

export const collectDueCatalogQueries = async (
    now = new Date(),
    deps: CatalogQueryCollectionDeps = defaultCollectionDeps
) => {
    const dueAtOrBefore = new Date(now.getTime() - CATALOG_QUERY_TRACKING_INTERVAL_MS);
    const queries = await deps.listDueQueries({ dueAtOrBefore, now });
    let startedCount = 0;
    let joinedCount = 0;

    for (const query of queries) {
        const resolution = await deps.resolveDueRequest({
            queryId: query.id,
            now,
            dueIntervalMs: CATALOG_QUERY_TRACKING_INTERVAL_MS,
            retryIntervalMs: CATALOG_QUERY_TRACKING_RETRY_INTERVAL_MS,
        });
        if (resolution.kind === 'notDue') {
            continue;
        }
        if (resolution.operation.type !== 'catalogSearch') {
            throw new Error(`Operation ${resolution.operation.id} is not a Catalog search.`);
        }
        await deps.dispatchOperation(resolution.operation);
        if (resolution.created) {
            startedCount += 1;
        } else {
            joinedCount += 1;
        }
    }

    return {
        didWork: startedCount > 0,
        dueCount: queries.length,
        startedCount,
        joinedCount,
    };
};
