import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchRuns, operations } from '@/db/schema';
import type { CatalogSearchOperationInput } from '@/services/operations';
import { mapOperationRecord } from './operations';
import { consumeRankWranglerServiceAccountUsage } from './service-account-usage';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResolveCatalogSearchInput = {
    source: 'keepa';
    marketplaceId: 'ATVPDKIKX0DER';
    normalizedTerm: string;
    displayTerm: string;
    page: 0;
    maxAgeSeconds: number;
    priority: 'interactive';
    serviceAccountId?: string;
    ownerMerchbaseUserId?: string;
    now?: Date;
};

export type ResolveCatalogSearchHooks = {
    beforeUsageCharge?: () => Promise<void>;
};

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

        const operationInput: CatalogSearchOperationInput = {
            queryId: query.id,
            marketplaceId: input.marketplaceId,
            term: input.displayTerm,
            page: input.page,
            priority: input.priority,
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
    dueIntervalMs,
    retryIntervalMs,
}: {
    queryId: string;
    now?: Date;
    dueIntervalMs: number;
    retryIntervalMs: number;
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
        if (!query?.trackedAt || (latestRunAgeMs !== null && latestRunAgeMs < dueIntervalMs)) {
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
        if (query.nextTrackingAttemptAt && query.nextTrackingAttemptAt > now) {
            return { kind: 'notDue' } as const;
        }

        const operationInput: CatalogSearchOperationInput = {
            queryId: query.id,
            marketplaceId: 'ATVPDKIKX0DER',
            term: query.displayTerm,
            page: 0,
            priority: 'scheduled',
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
                nextTrackingAttemptAt: new Date(now.getTime() + retryIntervalMs),
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

export const lockCatalogQueryForReconciliation = async (
    transaction: Transaction,
    queryId: string
) => {
    await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${'catalogSearch:' + queryId}))`
    );
};

const resolveAndLockCatalogQuery = async (
    transaction: Transaction,
    input: ResolveCatalogSearchInput,
    now: Date
) => {
    const [existing] = await findCatalogQuery(transaction, input);
    if (existing) {
        await lockCatalogQueryForReconciliation(transaction, existing.id);
        await updateCatalogQueryDisplayTerm(transaction, existing.id, input.displayTerm, now);
        return existing;
    }

    const [created] = await transaction
        .insert(catalogQueries)
        .values({
            source: input.source,
            marketplaceId: input.marketplaceId,
            normalizedTerm: input.normalizedTerm,
            displayTerm: input.displayTerm,
            page: input.page,
        })
        .onConflictDoNothing()
        .returning({ id: catalogQueries.id });

    if (created) {
        await lockCatalogQueryForReconciliation(transaction, created.id);
        return created;
    }

    const [concurrent] = await findCatalogQuery(transaction, input);
    if (!concurrent) {
        throw new Error('Failed to resolve Catalog query.');
    }
    await lockCatalogQueryForReconciliation(transaction, concurrent.id);
    await updateCatalogQueryDisplayTerm(transaction, concurrent.id, input.displayTerm, now);
    return concurrent;
};

const findCatalogQuery = async (transaction: Transaction, input: ResolveCatalogSearchInput) => {
    return await transaction
        .select({ id: catalogQueries.id })
        .from(catalogQueries)
        .where(
            and(
                eq(catalogQueries.source, input.source),
                eq(catalogQueries.marketplaceId, input.marketplaceId),
                eq(catalogQueries.normalizedTerm, input.normalizedTerm),
                eq(catalogQueries.page, input.page)
            )
        )
        .limit(1);
};

const updateCatalogQueryDisplayTerm = async (
    transaction: Transaction,
    queryId: string,
    displayTerm: string,
    now: Date
) => {
    await transaction
        .update(catalogQueries)
        .set({ displayTerm, updatedAt: now })
        .where(eq(catalogQueries.id, queryId));
};
