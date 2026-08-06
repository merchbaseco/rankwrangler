import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchRuns, operations } from '@/db/schema';
import {
    CATALOG_QUERY_REFRESH_INTERVAL_MS,
    CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS,
} from '@/services/catalog-query-refresh-policy';
import type { CatalogSearchOperationInput } from '@/services/operations';
import type { ResolveCatalogSearchInput } from './catalog-query-resolution';
import {
    lockCatalogQueryForReconciliation,
    renewCatalogQueryInterest,
    resolveAndLockCatalogQuery,
} from './catalog-query-resolution';
import type { CatalogSearchResolution } from './catalog-search-types';
import { mapOperationRecord } from './operations';
import { consumeRankWranglerServiceAccountUsage } from './service-account-usage';

export type { ResolveCatalogSearchInput } from './catalog-query-resolution';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ResolveCatalogSearchHooks {
    beforeUsageCharge?: () => Promise<void>;
}

export const resolveCatalogSearchRequest = async (
    input: ResolveCatalogSearchInput,
    hooks: ResolveCatalogSearchHooks = {}
): Promise<CatalogSearchResolution> => {
    const now = input.now ?? new Date();
    const serviceAccountId = input.serviceAccountId;

    return await db.transaction(async transaction => {
        const query = await resolveAndLockCatalogQuery(transaction, input, now);
        const queryState = await getCatalogQueryState(transaction, query.id);
        const reusableRunId = await getReusableCatalogSearchRunId(
            transaction,
            query.id,
            input.maxAgeSeconds,
            now
        );
        if (reusableRunId) {
            await renewCatalogQueryInterest(transaction, query.id, now);
            return { kind: 'ready', runId: reusableRunId } as const;
        }

        const pending = await getPendingCatalogSearchOperation(transaction, query.id);

        if (pending) {
            await renewCatalogQueryInterest(transaction, query.id, now);
            return {
                kind: 'pending',
                operation: pending,
                created: false,
                staleRunId: await getLatestRunId(transaction, query.id),
            } as const;
        }

        if (queryState.nextRefreshAttemptAt && queryState.nextRefreshAttemptAt > now) {
            await renewCatalogQueryInterest(transaction, query.id, now);
            return {
                kind: 'cooldown',
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((queryState.nextRefreshAttemptAt.getTime() - now.getTime()) / 1000)
                ),
                staleRunId: await getLatestRunId(transaction, query.id),
            } as const;
        }

        const billingRejection = await resolveCatalogSearchBilling(
            transaction,
            serviceAccountId,
            hooks,
            now
        );
        if (billingRejection) {
            return billingRejection;
        }
        await renewCatalogQueryInterest(transaction, query.id, now);

        const operationInput: CatalogSearchOperationInput = {
            queryId: query.id,
            marketplaceId: input.marketplaceId,
            term: input.displayTerm,
            page: input.page,
            priority: input.priority,
            trigger: input.trigger,
            ownerMerchbaseUserId: input.ownerMerchbaseUserId,
        };
        const [created] = await transaction
            .insert(operations)
            .values({
                type: 'catalogSearch',
                targetKey: query.id,
                input: operationInput,
            })
            .returning();

        if (!created) {
            throw new Error(`Failed to create Catalog-search Operation for ${query.id}`);
        }

        return {
            kind: 'pending',
            operation: mapCatalogSearchOperation(created),
            created: true,
            staleRunId: await getLatestRunId(transaction, query.id),
        } as const;
    });
};

export const resolveDueCatalogSearchRequest = async ({
    queryId,
    now = new Date(),
}: {
    queryId: string;
    now?: Date;
}) => {
    return await db.transaction(async transaction => {
        await lockCatalogQueryForReconciliation(transaction, queryId);
        const [query] = await transaction
            .select()
            .from(catalogQueries)
            .where(eq(catalogQueries.id, queryId))
            .limit(1);
        const latestRunAgeMs = query?.latestSuccessfulRunAt
            ? now.getTime() - query.latestSuccessfulRunAt.getTime()
            : null;
        if (
            !query?.activeUntil ||
            query.activeUntil <= now ||
            (latestRunAgeMs !== null && latestRunAgeMs < CATALOG_QUERY_REFRESH_INTERVAL_MS)
        ) {
            return { kind: 'notDue' } as const;
        }

        const [pending] = await transaction
            .select()
            .from(operations)
            .where(
                and(
                    eq(operations.type, 'catalogSearch'),
                    eq(operations.targetKey, query.id),
                    eq(operations.status, 'pending')
                )
            )
            .limit(1);
        if (pending) {
            return {
                kind: 'pending',
                operation: mapOperationRecord(pending),
                created: false,
            } as const;
        }
        if (query.nextRefreshAttemptAt && query.nextRefreshAttemptAt > now) {
            return { kind: 'notDue' } as const;
        }

        const operationInput: CatalogSearchOperationInput = {
            queryId: query.id,
            marketplaceId: 'ATVPDKIKX0DER',
            term: query.displayTerm,
            page: 0,
            priority: 'scheduled',
            trigger: 'automatic',
            ownerMerchbaseUserId: undefined,
        };
        const [created] = await transaction
            .insert(operations)
            .values({
                type: 'catalogSearch',
                targetKey: query.id,
                input: operationInput,
            })
            .returning();
        if (!created) {
            throw new Error(`Failed to create scheduled Catalog-search Operation for ${query.id}`);
        }
        await transaction
            .update(catalogQueries)
            .set({
                nextRefreshAttemptAt: new Date(
                    now.getTime() + CATALOG_QUERY_REFRESH_RETRY_INTERVAL_MS
                ),
                lastRefreshAttemptAt: now,
                updatedAt: now,
            })
            .where(eq(catalogQueries.id, query.id));

        return {
            kind: 'pending',
            operation: mapOperationRecord(created),
            created: true,
        } as const;
    });
};

const getLatestRunId = async (transaction: Transaction, queryId: string) => {
    const [latestRun] = await transaction
        .select({ id: catalogSearchRuns.id })
        .from(catalogSearchRuns)
        .where(eq(catalogSearchRuns.queryId, queryId))
        .orderBy(desc(catalogSearchRuns.sourceCompletedAt), desc(catalogSearchRuns.id))
        .limit(1);
    return latestRun?.id ?? null;
};

const getCatalogQueryState = async (transaction: Transaction, queryId: string) => {
    const [query] = await transaction
        .select({
            id: catalogQueries.id,
            nextRefreshAttemptAt: catalogQueries.nextRefreshAttemptAt,
        })
        .from(catalogQueries)
        .where(eq(catalogQueries.id, queryId))
        .limit(1);
    if (!query) {
        throw new Error(`Catalog query ${queryId} was not found.`);
    }
    return query;
};

const getReusableCatalogSearchRunId = async (
    transaction: Transaction,
    queryId: string,
    maxAgeSeconds: number,
    now: Date
) => {
    if (maxAgeSeconds <= 0) {
        return null;
    }
    const threshold = new Date(now.getTime() - maxAgeSeconds * 1000);
    const [reusableRun] = await transaction
        .select({ id: catalogSearchRuns.id })
        .from(catalogSearchRuns)
        .where(
            and(
                eq(catalogSearchRuns.queryId, queryId),
                gte(catalogSearchRuns.sourceCompletedAt, threshold)
            )
        )
        .orderBy(desc(catalogSearchRuns.sourceCompletedAt))
        .limit(1);
    return reusableRun?.id ?? null;
};

const getPendingCatalogSearchOperation = async (transaction: Transaction, queryId: string) => {
    const [pending] = await transaction
        .select()
        .from(operations)
        .where(
            and(
                eq(operations.type, 'catalogSearch'),
                eq(operations.targetKey, queryId),
                eq(operations.status, 'pending')
            )
        )
        .limit(1);
    return pending ? mapCatalogSearchOperation(pending) : null;
};

const mapCatalogSearchOperation = (row: typeof operations.$inferSelect) => {
    const operation = mapOperationRecord(row);
    if (operation.type !== 'catalogSearch') {
        throw new Error(`Operation ${operation.id} is not a Catalog search.`);
    }
    return operation;
};

const resolveCatalogSearchBilling = async (
    transaction: Transaction,
    serviceAccountId: string | undefined,
    hooks: ResolveCatalogSearchHooks,
    now: Date
): Promise<Extract<CatalogSearchResolution, { kind: 'billingRejected' }> | null> => {
    if (!serviceAccountId) {
        return { kind: 'billingRejected', reason: 'serviceAccountNotFound', usageLimit: null };
    }
    await hooks.beforeUsageCharge?.();
    const debit = await consumeRankWranglerServiceAccountUsage(
        transaction,
        serviceAccountId,
        1,
        now
    );
    if (debit.kind !== 'rejected') {
        return null;
    }
    return {
        kind: 'billingRejected',
        reason: debit.reason,
        usageLimit: debit.usageLimit,
    };
};
