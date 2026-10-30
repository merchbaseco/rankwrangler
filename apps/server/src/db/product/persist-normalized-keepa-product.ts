import { notifyKeywordProductRows } from '@/db/keyword-directory-notifications';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { db } from '@/db/index';
import { keepaHistoryRefreshQueue, productHistoryImports, products } from '@/db/schema';
import type { NormalizedKeepaProduct } from '@/services/keepa-product-normalizer';
import type { KeepaIngestionImport } from './persist-keepa-product-ingestion';
import { writeProductHistorySeries } from './product-history-series';
import {
    claimProductFamily,
    familyIdentityKey,
    recordVariantAliases,
    resolveFamilyIdentities,
} from './product-family';
import { reconcileMerchListing, reconcileSellerBullet } from './reconcile-merch-listing';

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const persistNormalizedKeepaProduct = async (
    transaction: DatabaseTransaction,
    normalized: NormalizedKeepaProduct,
    importDetails: KeepaIngestionImport
) => {
    const productId = await persistKeepaProductRow(transaction, normalized);
    return await persistKeepaProductHistory(transaction, productId, normalized, importDetails);
};

// The Product row alone: identity, listing fields and current Keepa metrics. Live keyword results
// need only this, so they save it first and the history after (persistKeepaProductHistory).
export const persistKeepaProductRow = async (
    transaction: DatabaseTransaction,
    normalized: NormalizedKeepaProduct
) => {
    const product = normalized.product;
    const asin = await keepaFamilyAsin(transaction, product);
    const [previous] = await transaction
        .select({ merch: products.isMerchListing })
        .from(products)
        .where(and(eq(products.marketplaceId, product.marketplaceId), eq(products.asin, asin)));
    const [storedProduct] = await transaction
        .insert(products)
        .values({
            marketplaceId: product.marketplaceId,
            asin,
            representativeAsin: asin === product.asin ? null : product.asin,
            title: product.title,
            brand: product.brand,
            thumbnailUrl: product.thumbnailUrl,
            isMerchListing: product.isMerchListing,
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
                representativeAsin: fillMissingCanonicalValue(products.representativeAsin),
                isMerchListing: reconcileMerchListing(products.isMerchListing),
                title: fillMissingCanonicalValue(products.title),
                brand: fillMissingCanonicalValue(products.brand),
                thumbnailUrl: fillMissingCanonicalValue(products.thumbnailUrl),
                bullet1: reconcileSellerBullet(products.bullet1, products.isMerchListing),
                bullet2: reconcileSellerBullet(products.bullet2, products.isMerchListing),
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
            merch: products.isMerchListing,
        });

    if (!storedProduct) {
        throw new Error(`Failed to persist Keepa Product ${product.asin}`);
    }
    await recordVariantAliases(transaction, product.marketplaceId, [
        { asin: product.asin, familyAsin: asin },
    ]);

    if (previous && previous.merch !== storedProduct.merch)
        await notifyKeywordProductRows(transaction, [storedProduct.id]);
    return storedProduct.id;
};

// The Keepa import record and its history series, replacing earlier successful imports. Each
// metric's series merges into the stored one in a single upsert per Product.
export const persistKeepaProductHistory = async (
    transaction: DatabaseTransaction,
    productId: string,
    normalized: NormalizedKeepaProduct,
    importDetails: KeepaIngestionImport
) => {
    const product = normalized.product;
    const [family] = await transaction
        .select({ asin: products.asin })
        .from(products)
        .where(eq(products.id, productId));
    const asin = family?.asin ?? product.asin;
    const [insertedImport] = await transaction
        .insert(productHistoryImports)
        .values({
            productId,
            marketplaceId: product.marketplaceId,
            asin,
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

    await writeProductHistorySeries(transaction, productId, normalized.historySeries, {
        source: 'keepa',
        prefer: 'incoming',
    });

    await transaction
        .delete(productHistoryImports)
        .where(
            and(
                eq(productHistoryImports.productId, productId),
                eq(productHistoryImports.source, 'keepa'),
                eq(productHistoryImports.status, 'success'),
                ne(productHistoryImports.id, insertedImport.id)
            )
        );
    await transaction
        .delete(keepaHistoryRefreshQueue)
        .where(
            and(
                eq(keepaHistoryRefreshQueue.marketplaceId, product.marketplaceId),
                eq(keepaHistoryRefreshQueue.asin, asin)
            )
        );

    return {
        productId,
        importId: insertedImport.id,
        importedAt: insertedImport.createdAt,
    };
};

// Keepa answers for a variant: write under its parent, or under a family the variant already maps to.
const keepaFamilyAsin = async (
    transaction: DatabaseTransaction,
    product: NormalizedKeepaProduct['product']
) => {
    if (product.parentAsin) return await claimProductFamily(transaction, product);
    const families = await resolveFamilyIdentities(transaction, [product]);
    return families.get(familyIdentityKey(product))?.asin ?? product.asin;
};

const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};

const fillMissingCanonicalValue = (column: { name: string }) => {
    return sql`COALESCE(${column}, ${sql.raw(`excluded.${column.name}`)})`;
};
