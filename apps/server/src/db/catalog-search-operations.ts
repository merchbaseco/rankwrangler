import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { catalogQueries } from '@/db/catalog-search-schema';
import { db } from '@/db/index';
import { mapOperationRecord } from '@/db/operations';
import { operations } from '@/db/ops-schema';
import { keywordRetryAt } from '@/services/keyword-collection-policy';
import type {
    CatalogSearchOperationInput,
    CatalogSearchResource,
    OperationError,
    OperationRecord,
} from '@/services/operations';
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
    startedAt,
}: {
    operationId: string;
    error: OperationError;
    completedAt?: Date;
    startedAt?: Date;
}): Promise<OperationRecord | null> => {
    return await db.transaction(async transaction => {
        const [pending] = await transaction
            .select({ targetKey: operations.targetKey, input: operations.input })
            .from(operations)
            .where(
                and(
                    eq(operations.id, operationId),
                    eq(operations.type, 'catalogSearch'),
                    eq(operations.status, 'pending'),
                    ...(startedAt ? [eq(operations.startedAt, startedAt)] : [])
                )
            )
            .limit(1);
        if (!pending) {
            return null;
        }

        const queryId = (pending.input as CatalogSearchOperationInput).queryId;
        await lockCatalogQueryForReconciliation(transaction, queryId);
        const [completed] = await transaction
            .update(operations)
            .set({
                status: 'completed',
                error,
                completedAt,
                updatedAt: completedAt,
            })
            .where(
                and(
                    eq(operations.id, operationId),
                    eq(operations.status, 'pending'),
                    ...(startedAt ? [eq(operations.startedAt, startedAt)] : [])
                )
            )
            .returning();
        if (!completed) {
            return null;
        }

        if (isRetryableCatalogSearchError(error)) {
            await updateCatalogSearchRetryAt(transaction, queryId, completedAt);
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
    const [query] = await transaction
        .select({
            nextRefreshAttemptAt: catalogQueries.nextRefreshAttemptAt,
            failureCount: catalogQueries.failureCount,
        })
        .from(catalogQueries)
        .where(eq(catalogQueries.id, queryId))
        .limit(1);
    const retryAt = keywordRetryAt(query?.failureCount ?? 0, completedAt);
    if (query?.nextRefreshAttemptAt && query.nextRefreshAttemptAt >= retryAt) {
        return;
    }
    await transaction
        .update(catalogQueries)
        .set({
            nextRefreshAttemptAt: retryAt,
            failureCount: (query?.failureCount ?? 0) + 1,
            updatedAt: completedAt,
        })
        .where(eq(catalogQueries.id, queryId));
};

export const releaseCatalogSearchWork = async (
    operationId: string,
    startedAt?: Date,
    retryAt?: Date
) => {
    await db.transaction(async tx => {
        const [operation] = await tx
            .select({ queryId: operations.targetKey })
            .from(operations)
            .where(eq(operations.id, operationId));
        if (!operation) {
            return;
        }
        await lockCatalogQueryForReconciliation(tx, operation.queryId);
        const released = await tx
            .update(operations)
            .set({ startedAt: null, updatedAt: new Date() })
            .where(
                and(
                    eq(operations.id, operationId),
                    eq(operations.type, 'catalogSearch'),
                    eq(operations.status, 'pending'),
                    ...(startedAt ? [eq(operations.startedAt, startedAt)] : [])
                )
            )
            .returning({ id: operations.id });
        if (retryAt && released.length > 0) {
            await tx
                .update(catalogQueries)
                .set({ nextRefreshAttemptAt: retryAt })
                .where(eq(catalogQueries.id, operation.queryId));
        }
    });
};
