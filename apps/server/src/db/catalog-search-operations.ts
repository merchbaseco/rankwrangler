import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { catalogQueries } from '@/db/catalog-search-schema';
import { db } from '@/db/index';
import { mapOperationRecord } from '@/db/operations';
import { operations } from '@/db/ops-schema';
import { CATALOG_SEARCH_INTERACTIVE_RETRY_INTERVAL_MS } from '@/services/catalog-query-refresh-policy';
import type { CatalogSearchResource, OperationError, OperationRecord } from '@/services/operations';
import { lockCatalogQueryForReconciliation } from './catalog-query-resolution';

const OPERATION_DISPATCH_STALE_MS = 5 * 60 * 1000;

export const listStalePendingCatalogSearchOperations = async (now = new Date(), limit = 100) => {
    const staleBefore = new Date(now.getTime() - OPERATION_DISPATCH_STALE_MS);
    const rows = await db
        .select()
        .from(operations)
        .where(
            and(
                eq(operations.type, 'catalogSearch'),
                eq(operations.status, 'pending'),
                or(isNull(operations.dispatchedAt), lte(operations.updatedAt, staleBefore))
            )
        )
        .limit(limit);

    return rows.map(mapOperationRecord);
};

export const completeCatalogSearchOperationWithError = async ({
    operationId,
    error,
    completedAt = new Date(),
}: {
    operationId: string;
    error: OperationError;
    completedAt?: Date;
}): Promise<OperationRecord | null> => {
    return await db.transaction(async transaction => {
        const [pending] = await transaction
            .select({ targetKey: operations.targetKey })
            .from(operations)
            .where(
                and(
                    eq(operations.id, operationId),
                    eq(operations.type, 'catalogSearch'),
                    eq(operations.status, 'pending')
                )
            )
            .limit(1);
        if (!pending) {
            return null;
        }

        await lockCatalogQueryForReconciliation(transaction, pending.targetKey);
        const [completed] = await transaction
            .update(operations)
            .set({
                status: 'completed',
                error,
                completedAt,
                updatedAt: completedAt,
            })
            .where(and(eq(operations.id, operationId), eq(operations.status, 'pending')))
            .returning();
        if (!completed) {
            return null;
        }

        if (isRetryableCatalogSearchError(error)) {
            await updateCatalogSearchRetryAt(transaction, pending.targetKey, completedAt);
        }
        return mapOperationRecord(completed);
    });
};

export const buildCatalogSearchResource = ({
    queryId,
    runId,
}: {
    queryId: string;
    runId: string;
}): CatalogSearchResource => ({
    type: 'catalogSearchRun',
    queryId,
    runId,
});

const isRetryableCatalogSearchError = (error: OperationError) =>
    error.code === 'PROVIDER_UNAVAILABLE' || error.code === 'INTERNAL_ERROR';

const updateCatalogSearchRetryAt = async (
    transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
    queryId: string,
    completedAt: Date
) => {
    const retryAt = new Date(completedAt.getTime() + CATALOG_SEARCH_INTERACTIVE_RETRY_INTERVAL_MS);
    const [query] = await transaction
        .select({ nextRefreshAttemptAt: catalogQueries.nextRefreshAttemptAt })
        .from(catalogQueries)
        .where(eq(catalogQueries.id, queryId))
        .limit(1);
    if (query?.nextRefreshAttemptAt && query.nextRefreshAttemptAt >= retryAt) {
        return;
    }
    await transaction
        .update(catalogQueries)
        .set({ nextRefreshAttemptAt: retryAt, updatedAt: completedAt })
        .where(eq(catalogQueries.id, queryId));
};
