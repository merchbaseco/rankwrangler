import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchRuns, operations } from '@/db/schema';
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
            if (
                pending.type === 'catalogSearch' &&
                pending.input.priority !== 'interactive' &&
                !pending.startedAt
            ) {
                const upgraded = {
                    ...pending.input,
                    priority: 'interactive' as const,
                    workClass: 'interactive' as const,
                    ownerMerchbaseUserId: input.ownerMerchbaseUserId,
                };
                await transaction
                    .update(operations)
                    .set({ input: upgraded })
                    .where(eq(operations.id, pending.id));
                pending.input = upgraded;
            }
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
            workClass: 'interactive',
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

const getLatestRunId = async (transaction: Transaction, queryId: string) => {
    const [latestRun] = await transaction
        .select({ id: catalogSearchRuns.id })
        .from(catalogSearchRuns)
        .where(and(eq(catalogSearchRuns.queryId, queryId), eq(catalogSearchRuns.page, 0)))
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
                and(eq(catalogSearchRuns.queryId, queryId), eq(catalogSearchRuns.page, 0)),
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
