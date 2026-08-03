import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    keepaHistoryRefreshQueue,
    productHistoryImports,
    productHistoryPoints,
    products,
} from '@/db/schema';
import type { KeepaIngestionImport } from './persist-keepa-product-ingestion';
import type { NormalizedKeepaProduct } from '@/services/keepa-product-normalizer';

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const persistNormalizedKeepaProduct = async (
    transaction: DatabaseTransaction,
    normalized: NormalizedKeepaProduct,
    importDetails: KeepaIngestionImport
) => {
    const product = normalized.product;
    const [storedProduct] = await transaction
        .insert(products)
        .values({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            title: product.title,
            brand: product.brand,
            thumbnailUrl: product.thumbnailUrl,
            bullet1: product.bullet1,
            bullet2: product.bullet2,
            dateFirstAvailable: product.dateFirstAvailable,
            rootCategoryId: product.rootCategoryId,
            rootCategoryBsr: product.rootCategoryBsr,
            keepaFetchedAt: product.keepaFetchedAt,
            keepaSourceUpdatedAt: product.keepaSourceUpdatedAt,
            keepaFirstTrackedAt: product.keepaFirstTrackedAt,
            keepaRootCategoryId: product.keepaRootCategoryId,
            keepaCurrentBsr: product.keepaCurrentBsr,
            keepaCurrentNewPrice: product.keepaCurrentNewPrice,
            keepaMonthlySold: product.keepaMonthlySold,
            keepaBsrAverage30: product.keepaBsrAverage30,
            keepaBsrAverage90: product.keepaBsrAverage90,
            keepaSalesRankDrops30: product.keepaSalesRankDrops30,
            keepaSalesRankDrops90: product.keepaSalesRankDrops90,
            keepaSalesRankDrops180: product.keepaSalesRankDrops180,
            keepaSalesRankDrops365: product.keepaSalesRankDrops365,
        })
        .onConflictDoUpdate({
            target: [products.marketplaceId, products.asin],
            set: {
                title: fillMissingCanonicalValue(products.title),
                brand: fillMissingCanonicalValue(products.brand),
                thumbnailUrl: fillMissingCanonicalValue(products.thumbnailUrl),
                bullet1: fillMissingCanonicalValue(products.bullet1),
                bullet2: fillMissingCanonicalValue(products.bullet2),
                dateFirstAvailable: fillMissingCanonicalValue(products.dateFirstAvailable),
                rootCategoryId: fillMissingCanonicalValue(products.rootCategoryId),
                rootCategoryBsr: fillMissingCanonicalValue(products.rootCategoryBsr),
                keepaSourceUpdatedAt: preserveExistingOnNull(products.keepaSourceUpdatedAt),
                keepaFirstTrackedAt: preserveExistingOnNull(products.keepaFirstTrackedAt),
                keepaRootCategoryId: preserveExistingOnNull(products.keepaRootCategoryId),
                keepaCurrentBsr: preserveExistingOnNull(products.keepaCurrentBsr),
                keepaCurrentNewPrice: preserveExistingOnNull(products.keepaCurrentNewPrice),
                keepaMonthlySold: preserveExistingOnNull(products.keepaMonthlySold),
                keepaBsrAverage30: preserveExistingOnNull(products.keepaBsrAverage30),
                keepaBsrAverage90: preserveExistingOnNull(products.keepaBsrAverage90),
                keepaSalesRankDrops30: preserveExistingOnNull(products.keepaSalesRankDrops30),
                keepaSalesRankDrops90: preserveExistingOnNull(products.keepaSalesRankDrops90),
                keepaSalesRankDrops180: preserveExistingOnNull(products.keepaSalesRankDrops180),
                keepaSalesRankDrops365: preserveExistingOnNull(products.keepaSalesRankDrops365),
                keepaFetchedAt: product.keepaFetchedAt,
            },
        })
        .returning({
            id: products.id,
            spApiFetchedAt: products.spApiFetchedAt,
        });

    if (!storedProduct) {
        throw new Error(`Failed to persist Keepa Product ${product.asin}`);
    }

    const [insertedImport] = await transaction
        .insert(productHistoryImports)
        .values({
            productId: storedProduct.id,
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            source: 'keepa',
            status: 'success',
            requestParams: importDetails.requestParams,
            responsePayload: importDetails.responsePayload,
            tokensConsumed: importDetails.tokensConsumed,
            tokensLeft: importDetails.tokensLeft,
            refillInMs: importDetails.refillInMs,
            refillRate: importDetails.refillRate,
            errorCode: null,
            errorMessage: null,
        })
        .returning({
            id: productHistoryImports.id,
            createdAt: productHistoryImports.createdAt,
        });

    if (!insertedImport) {
        throw new Error(`Failed to record Keepa import for ${product.asin}`);
    }

    for (let index = 0; index < normalized.historyPoints.length; index += 500) {
        const points = normalized.historyPoints.slice(index, index + 500);
        await transaction
            .insert(productHistoryPoints)
            .values(
                points.map(point => ({
                    productId: storedProduct.id,
                    marketplaceId: product.marketplaceId,
                    asin: product.asin,
                    source: 'keepa',
                    metric: point.metric,
                    categoryId: point.categoryId,
                    observedAt: point.observedAt,
                    keepaMinutes: point.keepaMinutes,
                    valueInt: point.valueInt,
                    isMissing: point.isMissing,
                }))
            )
            .onConflictDoUpdate({
                target: [
                    productHistoryPoints.productId,
                    productHistoryPoints.source,
                    productHistoryPoints.metric,
                    productHistoryPoints.categoryId,
                    productHistoryPoints.keepaMinutes,
                ],
                set: {
                    observedAt: sql`excluded.observed_at`,
                    valueInt: sql`excluded.value_int`,
                    isMissing: sql`excluded.is_missing`,
                },
            });
    }

    await transaction.delete(productHistoryImports).where(
        and(
            eq(productHistoryImports.productId, storedProduct.id),
            eq(productHistoryImports.source, 'keepa'),
            eq(productHistoryImports.status, 'success'),
            ne(productHistoryImports.id, insertedImport.id)
        )
    );
    await transaction.delete(keepaHistoryRefreshQueue).where(
        and(
            eq(keepaHistoryRefreshQueue.marketplaceId, product.marketplaceId),
            eq(keepaHistoryRefreshQueue.asin, product.asin)
        )
    );

    return {
        productId: storedProduct.id,
        spApiFetchedAt: storedProduct.spApiFetchedAt,
        importId: insertedImport.id,
        importedAt: insertedImport.createdAt,
    };
};

const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};

const fillMissingCanonicalValue = (column: { name: string }) => {
    return sql`COALESCE(${column}, ${sql.raw(`excluded.${column.name}`)})`;
};
