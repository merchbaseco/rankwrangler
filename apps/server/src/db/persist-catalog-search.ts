import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchResults, catalogSearchRuns, operations } from '@/db/schema';
import type { NormalizedKeepaProduct } from '@/services/keepa-product-normalizer';
import type { CatalogSearchOperationInput } from '@/services/operations';
import { lockCatalogQueryForReconciliation } from './catalog-query-resolution';
import { lockKeywordScheduling } from './keyword-scheduling-lock';
import { acceptKeywordObservation } from './keyword-observation';
import { buildCatalogSearchResource } from './catalog-search-operations';
import { persistNormalizedKeepaProduct } from './product/persist-normalized-keepa-product';

const CATALOG_NORMALIZER_VERSION = 1;

export interface CatalogSearchPersistenceResult {
    sourcePosition: number;
    normalized: NormalizedKeepaProduct;
}

export const persistCatalogSearchSuccess = async ({
    operationId,
    queryId,
    sourceStartedAt,
    sourceCompletedAt,
    trigger,
    results,
    internalUsage,
    page = 0,
    startedAt,
}: {
    operationId: string;
    page?: number;
    startedAt?: Date;
    queryId: string;
    sourceStartedAt: Date;
    sourceCompletedAt: Date;
    trigger: CatalogSearchOperationInput['trigger'];
    results: CatalogSearchPersistenceResult[];
    internalUsage: {
        tokensConsumed: number | null;
        tokensLeft: number | null;
        refillInMs: number | null;
        refillRate: number | null;
    };
}) => {
    return await db.transaction(async transaction => {
        await lockKeywordScheduling(transaction);
        await lockCatalogQueryForReconciliation(transaction, queryId);
        const [owned] = await transaction
            .select({ id: operations.id })
            .from(operations)
            .where(
                and(
                    eq(operations.id, operationId),
                    eq(operations.status, 'pending'),
                    ...(startedAt ? [eq(operations.startedAt, startedAt)] : [])
                )
            )
            .for('update');
        if (!owned) throw new Error('Catalog execution ownership expired.');
        const productIds: string[] = [];

        const [run] = await transaction
            .insert(catalogSearchRuns)
            .values({
                queryId,
                page,
                operationId,
                sourceStartedAt,
                sourceCompletedAt,
                trigger,
                resultCount: results.length,
                normalizerVersion: CATALOG_NORMALIZER_VERSION,
            })
            .returning({ id: catalogSearchRuns.id });
        if (!run) {
            throw new Error(`Failed to create Catalog Search run for ${queryId}`);
        }

        const orderedResults = [...results].sort((left, right) =>
            left.normalized.product.asin.localeCompare(right.normalized.product.asin)
        );
        for (const [index, result] of orderedResults.entries()) {
            const persisted = await persistNormalizedKeepaProduct(transaction, result.normalized, {
                requestParams: {
                    kind: 'catalogSearch',
                    queryId,
                    operationId,
                },
                responsePayload: null,
                tokensConsumed: index === 0 ? internalUsage.tokensConsumed : null,
                tokensLeft: index === 0 ? internalUsage.tokensLeft : null,
                refillInMs: index === 0 ? internalUsage.refillInMs : null,
                refillRate: index === 0 ? internalUsage.refillRate : null,
            });
            productIds.push(persisted.productId);
            const observed = result.normalized.product;
            await transaction.insert(catalogSearchResults).values({
                runId: run.id,
                productId: persisted.productId,
                sourcePosition: result.sourcePosition,
                observedRootCategoryBsr: observed.keepaCurrentBsr,
                observedNewPrice: observed.keepaCurrentNewPrice,
                observedMonthlySold: observed.keepaMonthlySold,
                observedBsrAverage30: observed.keepaBsrAverage30,
                observedBsrAverage90: observed.keepaBsrAverage90,
                observedSalesRankDrops30: observed.keepaSalesRankDrops30,
                observedSalesRankDrops90: observed.keepaSalesRankDrops90,
                observedSalesRankDrops180: observed.keepaSalesRankDrops180,
                observedSalesRankDrops365: observed.keepaSalesRankDrops365,
                observedSourceUpdatedAt: observed.keepaSourceUpdatedAt,
            });
        }

        await acceptKeywordObservation(transaction, {
            queryId,
            runId: run.id,
            page,
            completedAt: sourceCompletedAt,
            resultCount: results.length,
            productIds,
        });

        const [completedOperation] = await transaction
            .update(operations)
            .set({
                status: 'completed',
                resource: buildCatalogSearchResource({ queryId, runId: run.id }),
                completedAt: sourceCompletedAt,
                updatedAt: sourceCompletedAt,
            })
            .where(
                and(
                    eq(operations.id, operationId),
                    eq(operations.type, 'catalogSearch'),
                    eq(operations.status, 'pending')
                )
            )
            .returning({ id: operations.id });
        if (!completedOperation) {
            throw new Error(`Failed to complete Catalog-search Operation ${operationId}`);
        }

        return { runId: run.id };
    });
};
