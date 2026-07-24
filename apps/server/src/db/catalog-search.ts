import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    products,
} from '@/db/schema';
import { mapOperationRecord } from './operations';
import { consumeCatalogSearchLicenseUsage } from './catalog-search-license';
import { mapStoredProductInfo } from './product/product-info-mapper';
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

export const getCatalogSearchRun = async (runId: string) => {
    const rows = await db
        .select({
            run: catalogSearchRuns,
            query: catalogQueries,
            result: catalogSearchResults,
            product: products,
        })
        .from(catalogSearchRuns)
        .innerJoin(catalogQueries, eq(catalogQueries.id, catalogSearchRuns.queryId))
        .leftJoin(catalogSearchResults, eq(catalogSearchResults.runId, catalogSearchRuns.id))
        .leftJoin(products, eq(products.id, catalogSearchResults.productId))
        .where(eq(catalogSearchRuns.id, runId))
        .orderBy(catalogSearchResults.sourcePosition);

    const first = rows[0];
    if (!first) {
        return null;
    }

    return {
        id: first.run.id,
        query: {
            id: first.query.id,
            source: 'keepa' as const,
            marketplaceId: first.query.marketplaceId,
            normalizedTerm: first.query.normalizedTerm,
            displayTerm: first.query.displayTerm,
            page: first.query.page,
        },
        sourceStartedAt: first.run.sourceStartedAt.toISOString(),
        sourceCompletedAt: first.run.sourceCompletedAt.toISOString(),
        resultCount: first.run.resultCount,
        normalizerVersion: first.run.normalizerVersion,
        createdAt: first.run.createdAt.toISOString(),
        results: rows.flatMap(row => {
            if (!row.result || !row.product) {
                return [];
            }

            return [
                {
                    sourcePosition: row.result.sourcePosition,
                    observed: {
                        rootCategoryBsr: row.result.observedRootCategoryBsr,
                        newPriceAmountMinor: row.result.observedNewPrice,
                        currencyCode: 'USD' as const,
                        monthlySold: row.result.observedMonthlySold,
                        averageRootCategoryBsr30: row.result.observedBsrAverage30,
                        averageRootCategoryBsr90: row.result.observedBsrAverage90,
                        salesRankDrops: {
                            days30: row.result.observedSalesRankDrops30,
                            days90: row.result.observedSalesRankDrops90,
                            days180: row.result.observedSalesRankDrops180,
                            days365: row.result.observedSalesRankDrops365,
                        },
                        sourceUpdatedAt:
                            row.result.observedSourceUpdatedAt?.toISOString() ?? null,
                    },
                    product: mapStoredProductInfo(row.product),
                },
            ];
        }),
    };
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
