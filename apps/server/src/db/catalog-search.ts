import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchRuns,
    operations,
} from '@/db/schema';
import { mapOperationRecord } from './operations';
import { consumeCatalogSearchLicenseUsage } from './catalog-search-license';
import type { CatalogSearchOperationInput } from '@/services/operations';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResolveCatalogSearchInput = {
    source: 'keepa';
    marketplaceId: 'ATVPDKIKX0DER';
    normalizedTerm: string;
    displayTerm: string;
    page: 0;
    maxAgeSeconds: number;
    licenseId?: string;
    now?: Date;
};

export type ResolveCatalogSearchHooks = {
    beforeLicenseCharge?: () => Promise<void>;
};

export const resolveCatalogSearchRequest = async (
    input: ResolveCatalogSearchInput,
    hooks: ResolveCatalogSearchHooks = {}
) => {
    const now = input.now ?? new Date();

    return await db.transaction(async transaction => {
        const query = await resolveAndLockCatalogQuery(transaction, input, now);

        if (input.maxAgeSeconds > 0) {
            const threshold = new Date(now.getTime() - input.maxAgeSeconds * 1_000);
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

        if (input.licenseId) {
            await hooks.beforeLicenseCharge?.();
            const debit = await consumeCatalogSearchLicenseUsage(
                transaction,
                input.licenseId,
                now
            );
            if (debit.kind === 'rejected') {
                return {
                    kind: 'billingRejected',
                    reason: debit.reason,
                    usageLimit: debit.usageLimit,
                } as const;
            }
        }

        const operationInput: CatalogSearchOperationInput = {
            queryId: query.id,
            marketplaceId: input.marketplaceId,
            term: input.displayTerm,
            page: input.page,
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
    await updateCatalogQueryDisplayTerm(
        transaction,
        concurrent.id,
        input.displayTerm,
        now
    );
    return concurrent;
};

const findCatalogQuery = async (
    transaction: Transaction,
    input: ResolveCatalogSearchInput
) => {
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
