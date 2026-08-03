import { and, eq, sql } from 'drizzle-orm';
import type { db } from '@/db/index';
import { catalogQueries } from '@/db/schema';
import { CATALOG_QUERY_ACTIVE_WINDOW_MS } from '@/services/catalog-query-refresh-policy';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ResolveCatalogSearchInput {
    source: 'keepa';
    marketplaceId: 'ATVPDKIKX0DER';
    normalizedTerm: string;
    displayTerm: string;
    page: 0;
    maxAgeSeconds: number;
    priority: 'interactive';
    trigger: 'requested';
    serviceAccountId?: string;
    ownerMerchbaseUserId?: string;
    now?: Date;
}

export const resolveAndLockCatalogQuery = async (
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

export const lockCatalogQueryForReconciliation = async (
    transaction: Transaction,
    queryId: string
) => {
    await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`catalogSearch:${queryId}`}))`
    );
};

export const renewCatalogQueryInterest = async (
    transaction: Transaction,
    queryId: string,
    now: Date
) => {
    await transaction
        .update(catalogQueries)
        .set({
            lastRequestedAt: now,
            activeUntil: new Date(now.getTime() + CATALOG_QUERY_ACTIVE_WINDOW_MS),
            updatedAt: now,
        })
        .where(eq(catalogQueries.id, queryId));
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
