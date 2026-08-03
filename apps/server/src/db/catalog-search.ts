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
import { mapOperationRecord } from './operations';
import { consumeRankWranglerServiceAccountUsage } from './service-account-usage';

export type { ResolveCatalogSearchInput } from './catalog-query-resolution';

export interface ResolveCatalogSearchHooks {
    beforeUsageCharge?: () => Promise<void>;
}

export const resolveCatalogSearchRequest = async (
    input: ResolveCatalogSearchInput,
    hooks: ResolveCatalogSearchHooks = {}
) => {
    const now = input.now ?? new Date();
    const serviceAccountId = input.serviceAccountId;

    return await db.transaction(async transaction => {
        const query = await resolveAndLockCatalogQuery(transaction, input, now);

        if (input.maxAgeSeconds > 0) {
            const threshold = new Date(now.getTime() - input.maxAgeSeconds * 1000);
            const [reusableRun] = await transaction
                .select({ id: catalogSearchRuns.id })
                .from(catalogSearchRuns)
                .where(
                    and(
                        eq(catalogSearchRuns.queryId, query.id),
                        gte(catalogSearchRuns.sourceCompletedAt, threshold)
                    )
                )
                .orderBy(desc(catalogSearchRuns.sourceCompletedAt))
                .limit(1);

            if (reusableRun) {
                await renewCatalogQueryInterest(transaction, query.id, now);
                return { kind: 'ready', runId: reusableRun.id } as const;
            }
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
            await renewCatalogQueryInterest(transaction, query.id, now);
            return {
                kind: 'pending',
                operation: mapOperationRecord(pending),
                created: false,
            } as const;
        }

        if (!serviceAccountId) {
            return {
                kind: 'billingRejected',
                reason: 'serviceAccountNotFound' as const,
                usageLimit: null,
            };
        }

        await hooks.beforeUsageCharge?.();
        const debit = await consumeRankWranglerServiceAccountUsage(
            transaction,
            serviceAccountId,
            1,
            now
        );
        if (debit.kind === 'rejected') {
            return {
                kind: 'billingRejected',
                reason: debit.reason,
                usageLimit: debit.usageLimit,
            } as const;
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
            operation: mapOperationRecord(created),
            created: true,
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
