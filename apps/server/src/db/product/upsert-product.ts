import { notifyKeywordProductRows } from '@/db/keyword-directory-notifications';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products, spApiSyncQueue } from '@/db/schema';
import { sendProcessSpApiSyncQueueJob } from '@/services/spapi-sync-queue';
import type { SpApiProduct } from '@/types';
import { claimProductFamily, recordVariantAliases } from './product-family';
import { reconcileMerchListing, reconcileSellerBullet } from './reconcile-merch-listing';

type ProductWriteDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const upsertProductInfo = async (
    productInfo: SpApiProduct,
    database: ProductWriteDatabase = db
) => {
    const [identity] = await upsertProductsInfo([productInfo], database);
    return identity;
};

/**
 * Writes SP-API observations as variation families. A listing with a parent is stored under the
 * parent ASIN (every variant shares its rank) and remembered as an alias; a parent or a listing
 * without variants is stored under its own ASIN. Returns one identity per observed ASIN.
 */
export const upsertProductsInfo = async (
    productInfos: readonly SpApiProduct[],
    database: ProductWriteDatabase = db
) => {
    const unique = [...new Map(productInfos.map(info => [info.asin, info])).values()].sort(
        (left, right) => left.asin.localeCompare(right.asin)
    );
    if (!unique.length) return [];
    const marketplaceId = unique[0].marketplaceId;
    if (unique.some(info => info.marketplaceId !== marketplaceId))
        throw new Error('A product batch must belong to one marketplace');
    const result = await database.transaction(tx => writeFamilies(tx, marketplaceId, unique));
    if (result.queuedFamilies) await sendProcessSpApiSyncQueueJob();
    return result.identities;
};

const writeFamilies = async (
    transaction: Transaction,
    marketplaceId: string,
    infos: readonly SpApiProduct[]
) => {
    const familyOf = new Map<string, string>();
    for (const info of infos) familyOf.set(info.asin, await claimProductFamily(transaction, info));
    const own = infos.filter(info => familyOf.get(info.asin) === info.asin);
    const ownFamilies = new Set(own.map(info => info.asin));
    const variants = [
        ...new Map(
            infos
                .filter(info => !ownFamilies.has(familyOf.get(info.asin) ?? info.asin))
                .map(info => [familyOf.get(info.asin) ?? info.asin, info])
        ).values(),
    ];
    const familyAsins = [...new Set(familyOf.values())];
    const previous = new Map(
        (
            await transaction
                .select({
                    asin: products.asin,
                    merch: products.isMerchListing,
                    status: products.amazonListingStatus,
                })
                .from(products)
                .where(
                    and(eq(products.marketplaceId, marketplaceId), inArray(products.asin, familyAsins))
                )
        ).map(row => [row.asin, row])
    );
    const written = [
        ...(await writeRows(transaction, marketplaceId, own, info => info.asin, 'own')),
        ...(await writeRows(
            transaction,
            marketplaceId,
            variants,
            info => familyOf.get(info.asin) ?? info.asin,
            'variant'
        )),
    ];
    await recordVariantAliases(
        transaction,
        marketplaceId,
        infos.map(info => ({ asin: info.asin, familyAsin: familyOf.get(info.asin) ?? info.asin }))
    );
    // A family first met through a variant carries the variant's title; fetch the parent itself.
    const newFromVariants = written.filter(row => row.inserted && row.fromVariant);
    if (newFromVariants.length)
        await transaction
            .insert(spApiSyncQueue)
            .values(newFromVariants.map(row => ({ marketplaceId, asin: row.asin })))
            .onConflictDoNothing();
    const changed = written.filter(row => {
        const before = previous.get(row.asin);
        return before && (before.merch !== row.merch || before.status !== 'active');
    });
    if (changed.length)
        await notifyKeywordProductRows(
            transaction,
            changed.map(row => row.id)
        );
    const byFamily = new Map(written.map(row => [row.asin, row]));
    return {
        queuedFamilies: newFromVariants.length > 0,
        identities: infos.flatMap(info => {
            const row = byFamily.get(familyOf.get(info.asin) ?? info.asin);
            return row
                ? [{ id: row.id, asin: row.asin, sourceAsin: info.asin, inserted: row.inserted }]
                : [];
        }),
    };
};

const writeRows = async (
    transaction: Transaction,
    marketplaceId: string,
    infos: readonly SpApiProduct[],
    familyAsin: (info: SpApiProduct) => string,
    kind: 'own' | 'variant'
) => {
    if (!infos.length) return [];
    // A variant's listing fields (its title names the size and color) only fill gaps; the
    // family's rank and Merch evidence apply either way.
    const listing = kind === 'own' ? incoming : fillMissing;
    const rows = await transaction
        .insert(products)
        .values(
            infos.map(info => {
                const fetchedAt = new Date(info.fetchedAt);
                return {
                    marketplaceId,
                    asin: familyAsin(info),
                    representativeAsin: kind === 'own' ? info.childAsin : info.asin,
                    dateFirstAvailable: info.dateFirstAvailable
                        ? new Date(info.dateFirstAvailable)
                        : null,
                    thumbnailUrl: info.thumbnailUrl,
                    title: info.title,
                    brand: info.brand,
                    isMerchListing: info.isMerchListing,
                    amazonListingStatus: 'active' as const,
                    bullet1: info.bullet1,
                    bullet2: info.bullet2,
                    rootCategoryId: info.rootCategoryId,
                    rootCategoryBsr: info.rootCategoryBsr,
                    spApiFetchedAt: fetchedAt,
                    spApiResolvedAt: fetchedAt,
                    // Every catalog call asks for relationships, so any fetch checks variations.
                    variationsCheckedAt: fetchedAt,
                };
            })
        )
        .onConflictDoUpdate({
            target: [products.marketplaceId, products.asin],
            set: {
                representativeAsin: fillMissing(products.representativeAsin),
                dateFirstAvailable: listing(products.dateFirstAvailable),
                thumbnailUrl: listing(products.thumbnailUrl),
                title: listing(products.title),
                brand: listing(products.brand),
                isMerchListing: reconcileMerchListing(products.isMerchListing),
                amazonListingStatus: 'active',
                bullet1: reconcileSellerBullet(products.bullet1, products.isMerchListing),
                bullet2: reconcileSellerBullet(products.bullet2, products.isMerchListing),
                rootCategoryId: preserveExistingOnNull(products.rootCategoryId),
                rootCategoryBsr: preserveExistingOnNull(products.rootCategoryBsr),
                spApiFetchedAt: listing(products.spApiFetchedAt),
                spApiResolvedAt: listing(products.spApiResolvedAt),
                variationsCheckedAt: preserveExistingOnNull(products.variationsCheckedAt),
            },
        })
        .returning({
            id: products.id,
            asin: products.asin,
            inserted: sql<boolean>`(xmax = 0)`,
            merch: products.isMerchListing,
        });
    return rows.map(row => ({ ...row, fromVariant: kind === 'variant' }));
};

const incoming = (column: { name: string }) => sql.raw(`excluded.${column.name}`);
const fillMissing = (column: { name: string }) =>
    sql`COALESCE(${column}, ${sql.raw(`excluded.${column.name}`)})`;
const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};
