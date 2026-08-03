import { listDueActiveCatalogQueries } from '@/db/catalog-query-refresh';
import { resolveDueCatalogSearchRequest } from '@/db/catalog-search';
import { CATALOG_QUERY_REFRESH_INTERVAL_MS } from './catalog-query-refresh-policy';
import { type CatalogSearchOperation, dispatchCatalogSearchOperation } from './catalog-search';

type DueResolution = Awaited<ReturnType<typeof resolveDueCatalogSearchRequest>>;

export interface CatalogQueryCollectionDeps {
    listDueQueries: typeof listDueActiveCatalogQueries;
    resolveDueRequest: (
        input: Parameters<typeof resolveDueCatalogSearchRequest>[0]
    ) => Promise<DueResolution>;
    dispatchOperation: (operation: CatalogSearchOperation) => Promise<boolean>;
}

const defaultCollectionDeps: CatalogQueryCollectionDeps = {
    listDueQueries: listDueActiveCatalogQueries,
    resolveDueRequest: resolveDueCatalogSearchRequest,
    dispatchOperation: dispatchCatalogSearchOperation,
};

export const collectDueCatalogQueries = async (
    now = new Date(),
    deps: CatalogQueryCollectionDeps = defaultCollectionDeps
) => {
    const dueAtOrBefore = new Date(now.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS);
    const queries = await deps.listDueQueries({ dueAtOrBefore, now });
    let startedCount = 0;
    let joinedCount = 0;

    for (const query of queries) {
        const resolution = await deps.resolveDueRequest({
            queryId: query.id,
            now,
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
