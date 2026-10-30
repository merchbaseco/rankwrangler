import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { productHistoryImports, products } from '@/db/schema';
import { extractKeepaErrorDetails, resolveCategoryNames } from '@/services/keepa';
import { ingestKeepaProduct } from '@/services/keepa-product-ingestion';
import { getErrorMessage } from '@/services/job-executions-utils';
import { KeepaCapacityDeferredError } from '@/services/providers/keepa/keepa-capacity-types';
import { createKeepaProvider } from '@/services/providers/keepa/keepa-provider';
import type { KeepaResponse } from '@/services/providers/keepa/keepa-provider-types';

export type KeepaHistoryBatchOutcome =
    | { asin: string; status: 'success' }
    | { asin: string; status: 'failed'; message: string };

const keepaProvider = createKeepaProvider();

// One Keepa request for the batch; each product is then saved on its own, so one bad product
// does not fail the rest. Import rows carry the product's share of the request's tokens.
export const loadKeepaHistoryBatch = async ({
    marketplaceId,
    asins,
    days,
}: {
    marketplaceId: string;
    asins: readonly string[];
    days: number;
}): Promise<KeepaHistoryBatchOutcome[]> => {
    const productRows = await db
        .select({ id: products.id, asin: products.asin })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), inArray(products.asin, [...asins])));
    const productIds = new Map(productRows.map(row => [row.asin, row.id]));
    const requestParams = { marketplaceId, batchSize: asins.length, history: 1, update: 1, days, stats: 365 };

    let response: KeepaResponse;
    try {
        response = await keepaProvider.getProducts({ marketplaceId, asins, days });
    } catch (error) {
        if (error instanceof KeepaCapacityDeferredError) {
            throw error;
        }
        const details = extractKeepaErrorDetails(error);
        for (const row of productRows) {
            await insertErrorImport({
                productId: row.id,
                marketplaceId,
                asin: row.asin,
                requestParams: { ...requestParams, asin: row.asin },
                responsePayload: details.payload,
                tokensConsumed: details.tokensConsumed,
                tokensLeft: details.tokensLeft,
                refillInMs: details.refillIn,
                refillRate: details.refillRate,
                errorCode: details.code,
                errorMessage: details.message,
            });
        }
        const message = `Keepa request failed: ${details.message}`;
        return asins.map(asin => ({ asin, status: 'failed', message }));
    }

    const usage = {
        tokensConsumed:
            response.tokensConsumed == null
                ? null
                : Math.ceil(response.tokensConsumed / asins.length),
        tokensLeft: response.tokensLeft ?? null,
        refillInMs: response.refillIn ?? null,
        refillRate: response.refillRate ?? null,
    };
    const payloads = new Map((response.products ?? []).map(product => [product.asin, product]));
    const categoryIds: number[] = [];
    const outcomes: KeepaHistoryBatchOutcome[] = [];
    for (const asin of asins) {
        const productId = productIds.get(asin);
        const product = payloads.get(asin);
        if (!productId) {
            outcomes.push({ asin, status: 'failed', message: 'Product not found in cache' });
            continue;
        }
        if (!product) {
            await insertErrorImport({
                productId,
                marketplaceId,
                asin,
                requestParams: { ...requestParams, asin },
                responsePayload: null,
                ...usage,
                tokensConsumed: null,
                errorCode: response.error?.code ?? 'NO_PRODUCT',
                errorMessage: response.error?.message ?? 'Keepa returned no product payload',
            });
            outcomes.push({ asin, status: 'failed', message: 'Keepa returned no product history' });
            continue;
        }
        try {
            const ingestion = await ingestKeepaProduct({
                marketplaceId,
                asin,
                product,
                fetchedAt: new Date(),
                import: {
                    requestParams: { ...requestParams, asin },
                    responsePayload: { ...response, products: [product] } as unknown as Record<
                        string,
                        unknown
                    >,
                    ...usage,
                },
            });
            categoryIds.push(...ingestion.normalized.historySeries.map(series => series.categoryId));
            outcomes.push({ asin, status: 'success' });
        } catch (error) {
            outcomes.push({ asin, status: 'failed', message: getErrorMessage(error) });
        }
    }
    await resolveCategoryNames({ marketplaceId, categoryIds });
    return outcomes;
};

const insertErrorImport = async (
    values: Omit<typeof productHistoryImports.$inferInsert, 'source' | 'status'>
) => {
    await db.insert(productHistoryImports).values({ ...values, source: 'keepa', status: 'error' });
};
