import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { operations } from '@/db/ops-schema.js';
import type {
    CatalogSearchOperationInput,
    CatalogSearchResource,
    OperationError,
    OperationRecord,
    ProductHistoryOperationInput,
    ProductHistoryResource,
} from '@/services/operations.js';

const OPERATION_DISPATCH_STALE_MS = 5 * 60 * 1000;

export const ensurePendingProductHistoryOperation = async ({
    marketplaceId,
    asin,
    ownerMerchbaseUserId,
}: {
    marketplaceId: string;
    asin: string;
    ownerMerchbaseUserId: string;
}) => {
    const targetKey = buildProductHistoryTargetKey({ marketplaceId, asin });
    const lockKey = `productHistoryRefresh:${targetKey}`;

    return await db.transaction(async transaction => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

        const [pending] = await transaction
            .select()
            .from(operations)
            .where(
                and(
                    eq(operations.type, 'productHistoryRefresh'),
                    eq(operations.targetKey, targetKey),
                    eq(operations.status, 'pending')
                )
            )
            .limit(1);

        if (pending) {
            return { operation: mapOperationRecord(pending), created: false };
        }

        const input: ProductHistoryOperationInput = {
            marketplaceId,
            asin,
            days: 3650,
            ownerMerchbaseUserId,
        };
        const [created] = await transaction
            .insert(operations)
            .values({
                type: 'productHistoryRefresh',
                targetKey,
                input,
            })
            .returning();

        if (!created) {
            throw new Error(`Failed to create Product-history Operation for ${targetKey}`);
        }

        return { operation: mapOperationRecord(created), created: true };
    });
};

export const getOperationById = async (operationId: string) => {
    const [operation] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, operationId))
        .limit(1);

    return operation ? mapOperationRecord(operation) : null;
};

export const getPendingProductHistoryOperation = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const [operation] = await db
        .select()
        .from(operations)
        .where(
            and(
                eq(operations.type, 'productHistoryRefresh'),
                eq(operations.targetKey, buildProductHistoryTargetKey({ marketplaceId, asin })),
                eq(operations.status, 'pending')
            )
        )
        .limit(1);

    return operation ? mapOperationRecord(operation) : null;
};

export const claimOperationDispatch = async (operationId: string, now = new Date()) => {
    const staleBefore = new Date(now.getTime() - OPERATION_DISPATCH_STALE_MS);
    const claimed = await db
        .update(operations)
        .set({
            dispatchedAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(operations.id, operationId),
                eq(operations.status, 'pending'),
                or(isNull(operations.dispatchedAt), lte(operations.updatedAt, staleBefore))
            )
        )
        .returning({ id: operations.id });

    return claimed.length === 1;
};

export const releaseOperationDispatch = async (operationId: string) => {
    await db
        .update(operations)
        .set({
            dispatchedAt: null,
            updatedAt: new Date(),
        })
        .where(and(eq(operations.id, operationId), eq(operations.status, 'pending')));
};

export const deletePendingOperation = async (operationId: string) => {
    await db
        .delete(operations)
        .where(and(eq(operations.id, operationId), eq(operations.status, 'pending')));
};

export const claimOperationWork = async (operationId: string, now = new Date()) => {
    const staleBefore = new Date(now.getTime() - OPERATION_DISPATCH_STALE_MS);
    const [claimed] = await db
        .update(operations)
        .set({
            startedAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(operations.id, operationId),
                eq(operations.status, 'pending'),
                or(isNull(operations.startedAt), lte(operations.startedAt, staleBefore))
            )
        )
        .returning();

    return claimed ? mapOperationRecord(claimed) : null;
};

export const releaseOperationWork = async (operationId: string) => {
    await db
        .update(operations)
        .set({
            startedAt: null,
            updatedAt: new Date(),
        })
        .where(and(eq(operations.id, operationId), eq(operations.status, 'pending')));
};

export const completeOperationWithError = async ({
    operationId,
    error,
    completedAt = new Date(),
}: {
    operationId: string;
    error: OperationError;
    completedAt?: Date;
}) => {
    const [completed] = await db
        .update(operations)
        .set({
            status: 'completed',
            error,
            completedAt,
            updatedAt: completedAt,
        })
        .where(and(eq(operations.id, operationId), eq(operations.status, 'pending')))
        .returning();

    return completed ? mapOperationRecord(completed) : await getOperationById(operationId);
};

export const completeProductHistoryOperationSuccess = async ({
    operationId,
    marketplaceId,
    asin,
    completedAt = new Date(),
}: {
    operationId: string;
    marketplaceId: string;
    asin: string;
    completedAt?: Date;
}) => {
    const resource = buildProductHistoryResource({ marketplaceId, asin });
    const [completed] = await db
        .update(operations)
        .set({
            status: 'completed',
            resource,
            completedAt,
            updatedAt: completedAt,
        })
        .where(and(eq(operations.id, operationId), eq(operations.status, 'pending')))
        .returning();

    return completed ? mapOperationRecord(completed) : await getOperationById(operationId);
};

export const listStalePendingProductHistoryOperations = async (now = new Date(), limit = 100) => {
    const staleBefore = new Date(now.getTime() - OPERATION_DISPATCH_STALE_MS);
    const rows = await db
        .select()
        .from(operations)
        .where(
            and(
                eq(operations.type, 'productHistoryRefresh'),
                eq(operations.status, 'pending'),
                or(isNull(operations.dispatchedAt), lte(operations.updatedAt, staleBefore))
            )
        )
        .limit(limit);

    return rows.map(mapOperationRecord);
};

export const buildProductHistoryResource = ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}): ProductHistoryResource => ({
    type: 'productHistory',
    marketplaceId,
    asin,
});

const buildProductHistoryTargetKey = ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => `${marketplaceId}:${asin}`;

export const mapOperationRecord = (row: typeof operations.$inferSelect): OperationRecord => {
    const common = {
        id: row.id,
        status: row.status as OperationRecord['status'],
        targetKey: row.targetKey,
        error: row.error as OperationError | null,
        dispatchedAt: row.dispatchedAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };

    if (row.type === 'productHistoryRefresh') {
        return {
            ...common,
            type: row.type,
            input: row.input as ProductHistoryOperationInput,
            resource: row.resource as ProductHistoryResource | null,
        };
    }
    if (row.type === 'catalogSearch') {
        return {
            ...common,
            type: row.type,
            input: row.input as CatalogSearchOperationInput,
            resource: row.resource as CatalogSearchResource | null,
        };
    }
    throw new Error(`Unsupported Operation type: ${row.type}`);
};
