import { notifyKeywordProductRows } from '@/db/keyword-directory-notifications';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import type { SpApiProduct } from '@/types';
import { reconcileMerchListing, reconcileSellerBullet } from './reconcile-merch-listing';

type ProductWriteDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const upsertProductInfo = async (
    productInfo: SpApiProduct,
    database: ProductWriteDatabase = db
) => {
    const [identity] = await upsertProductsInfo([productInfo], database);
    return identity;
};

// One read and one multi-row upsert per call, whatever the batch size: a 20-product SP-API page
// used to make about forty sequential round trips to the database.
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
    const asins = unique.map(info => info.asin);
    const previous = new Map(
        (
            await database
                .select({
                    asin: products.asin,
                    merch: products.isMerchListing,
                    status: products.amazonListingStatus,
                })
                .from(products)
                .where(and(eq(products.marketplaceId, marketplaceId), inArray(products.asin, asins)))
        ).map(row => [row.asin, row])
    );
    const identities = await database
        .insert(products)
        .values(
            unique.map(info => {
                const fetchedAt = new Date(info.fetchedAt);
                return {
                    marketplaceId,
                    asin: info.asin,
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
                };
            })
        )
        .onConflictDoUpdate({
            target: [products.marketplaceId, products.asin],
            set: {
                dateFirstAvailable: incoming(products.dateFirstAvailable),
                thumbnailUrl: incoming(products.thumbnailUrl),
                title: incoming(products.title),
                brand: incoming(products.brand),
                isMerchListing: reconcileMerchListing(products.isMerchListing),
                amazonListingStatus: 'active',
                bullet1: reconcileSellerBullet(products.bullet1, products.isMerchListing),
                bullet2: reconcileSellerBullet(products.bullet2, products.isMerchListing),
                rootCategoryId: preserveExistingOnNull(products.rootCategoryId),
                rootCategoryBsr: preserveExistingOnNull(products.rootCategoryBsr),
                spApiFetchedAt: incoming(products.spApiFetchedAt),
                spApiResolvedAt: incoming(products.spApiResolvedAt),
            },
        })
        .returning({
            id: products.id,
            asin: products.asin,
            inserted: sql<boolean>`(xmax = 0)`,
            merch: products.isMerchListing,
        });
    const changed = identities.filter(identity => {
        const before = previous.get(identity.asin);
        return before && (before.merch !== identity.merch || before.status !== 'active');
    });
    if (changed.length)
        await notifyKeywordProductRows(
            database,
            changed.map(identity => identity.id)
        );
    return identities.map(({ id, asin, inserted }) => ({ id, asin, inserted }));
};

const incoming = (column: { name: string }) => sql.raw(`excluded.${column.name}`);
const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};
