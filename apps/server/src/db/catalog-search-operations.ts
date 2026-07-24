import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { mapOperationRecord } from '@/db/operations';
import { operations } from '@/db/ops-schema';
import type { CatalogSearchResource } from '@/services/operations';

const OPERATION_DISPATCH_STALE_MS = 5 * 60 * 1000;

export const listStalePendingCatalogSearchOperations = async (
    now = new Date(),
    limit = 100
) => {
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
