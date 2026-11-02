import { notifyKeywordProductRows } from '@/db/keyword-directory-notifications';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
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
    const [productId] = await persistKeepaProductRows(transaction, [normalized]);
    return productId;
};

// A page of Product rows in a few statements, not a few per Product: a live search saves its whole
// page while a caller waits, and each statement is a round trip to the remote database. Returns
// each Product's family row id in input order; a family seen twice is written once, by its first
// Product.
export const persistKeepaProductRows = async (
    transaction: DatabaseTransaction,
    normalizedProducts: readonly NormalizedKeepaProduct[]
) => {
    const items = normalizedProducts.map(normalized => normalized.product);
    if (!items.length) return [];
    const marketplaceId = items[0].marketplaceId;
    if (items.some(item => item.marketplaceId !== marketplaceId))
        throw new Error('A Keepa Product page must belong to one marketplace');
    const familyAsins = await keepaFamilyAsins(transaction, items);
    const rowsByFamily = new Map<string, NormalizedKeepaProduct['product']>();
    items.forEach((item, index) => {
        if (!rowsByFamily.has(familyAsins[index])) rowsByFamily.set(familyAsins[index], item);
    });
    const previous = new Map(
        (
            await transaction
                .select({ asin: products.asin, merch: products.isMerchListing })
                .from(products)
                .where(
                    and(
                        eq(products.marketplaceId, marketplaceId),
                        inArray(products.asin, [...rowsByFamily.keys()])
                    )
                )
        ).map(row => [row.asin, row.merch])
    );
    const stored = new Map<string, { id: string; merch: boolean }>();
    // A decided Merch verdict replaces the stored one; an undecided one leaves it.
    for (const decided of [true, false]) {
        const rows = [...rowsByFamily].filter(
            ([, item]) => (item.merch.kind === 'decided') === decided
        );
        if (!rows.length) continue;
        const written = await transaction
            .insert(products)
            .values(rows.map(([asin, item]) => productRowValues(asin, item)))
            .onConflictDoUpdate({
                target: [products.marketplaceId, products.asin],
                set: {
                    representativeAsin: fillMissingCanonicalValue(products.representativeAsin),
                    ...(decided ? latestMerchVerdict : {}),
                    title: fillMissingCanonicalValue(products.title),
                    brand: fillMissingCanonicalValue(products.brand),
                    thumbnailUrl: fillMissingCanonicalValue(products.thumbnailUrl),
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
                    keepaFetchedAt: sql.raw(`excluded.${products.keepaFetchedAt.name}`),
                },
            })
            .returning({ id: products.id, asin: products.asin, merch: products.isMerchListing });
        for (const row of written) stored.set(row.asin, row);
    }
    await recordVariantAliases(
        transaction,
        marketplaceId,
        items.map((item, index) => ({ asin: item.asin, familyAsin: familyAsins[index] }))
    );
    const changed = [...stored].flatMap(([asin, row]) =>
        previous.has(asin) && previous.get(asin) !== row.merch ? [row.id] : []
    );
    if (changed.length) await notifyKeywordProductRows(transaction, changed);
    return familyAsins.map(asin => {
        const row = stored.get(asin);
        if (!row) throw new Error(`Failed to persist Keepa Product family ${asin}`);
        return row.id;
    });
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
// Claiming a parent writes, so variants claim one at a time; the rest resolve in one read.
const keepaFamilyAsins = async (
    transaction: DatabaseTransaction,
    items: readonly NormalizedKeepaProduct['product'][]
) => {
    const familyAsins = items.map(item => item.asin);
    for (const [index, item] of items.entries()) {
        if (item.parentAsin) familyAsins[index] = await claimProductFamily(transaction, item);
    }
    const plain = items.filter(item => !item.parentAsin);
    const families = plain.length ? await resolveFamilyIdentities(transaction, plain) : new Map();
    items.forEach((item, index) => {
        if (!item.parentAsin)
            familyAsins[index] = families.get(familyIdentityKey(item))?.asin ?? item.asin;
    });
    return familyAsins;
};

const productRowValues = (asin: string, product: NormalizedKeepaProduct['product']) => {
    const merch =
        product.merch.kind === 'decided'
            ? product.merch
            : { isMerchListing: false, bullet1: null, bullet2: null };
    return {
        marketplaceId: product.marketplaceId,
        asin,
        representativeAsin: asin === product.asin ? null : product.asin,
        title: product.title,
        brand: product.brand,
        thumbnailUrl: product.thumbnailUrl,
        isMerchListing: merch.isMerchListing,
        bullet1: merch.bullet1,
        bullet2: merch.bullet2,
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
    };
};

const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};

// A decided observation replaces the stored status and seller bullets; true can become false.
const latestMerchVerdict = {
    isMerchListing: sql.raw(`excluded.${products.isMerchListing.name}`),
    bullet1: sql.raw(`excluded.${products.bullet1.name}`),
    bullet2: sql.raw(`excluded.${products.bullet2.name}`),
};

const fillMissingCanonicalValue = (column: { name: string }) => {
    return sql`COALESCE(${column}, ${sql.raw(`excluded.${column.name}`)})`;
};
