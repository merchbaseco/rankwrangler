import { notifyKeywordProductRows } from '@/db/keyword-directory-notifications';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import type { SpApiProduct } from '@/types';
import { reconcileMerchListing, reconcileSellerBullet } from './reconcile-merch-listing';

type ProductWriteDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const upsertProductInfo = async (
    productInfo: SpApiProduct,
    database: ProductWriteDatabase = db
) => {
    const [previous] = await database
        .select({ merch: products.isMerchListing, status: products.amazonListingStatus })
        .from(products)
        .where(
            and(
                eq(products.marketplaceId, productInfo.marketplaceId),
                eq(products.asin, productInfo.asin)
            )
        );
    const dateFirstAvailable = productInfo.dateFirstAvailable
        ? new Date(productInfo.dateFirstAvailable)
        : null;
    const fetchedAt = new Date(productInfo.fetchedAt);

    const [identity] = await database
        .insert(products)
        .values({
            marketplaceId: productInfo.marketplaceId,
            asin: productInfo.asin,
            dateFirstAvailable,
            thumbnailUrl: productInfo.thumbnailUrl,
            title: productInfo.title,
            brand: productInfo.brand,
            isMerchListing: productInfo.isMerchListing,
            amazonListingStatus: 'active',
            bullet1: productInfo.bullet1,
            bullet2: productInfo.bullet2,
            rootCategoryId: productInfo.rootCategoryId,
            rootCategoryBsr: productInfo.rootCategoryBsr,
            spApiFetchedAt: fetchedAt,
            spApiResolvedAt: fetchedAt,
        })
        .onConflictDoUpdate({
            target: [products.marketplaceId, products.asin],
            set: {
                dateFirstAvailable,
                thumbnailUrl: productInfo.thumbnailUrl,
                title: productInfo.title,
                brand: productInfo.brand,
                isMerchListing: reconcileMerchListing(products.isMerchListing),
                amazonListingStatus: 'active',
                bullet1: reconcileSellerBullet(products.bullet1, products.isMerchListing),
                bullet2: reconcileSellerBullet(products.bullet2, products.isMerchListing),
                rootCategoryId: preserveExistingOnNull(products.rootCategoryId),
                rootCategoryBsr: preserveExistingOnNull(products.rootCategoryBsr),
                spApiFetchedAt: fetchedAt,
                spApiResolvedAt: fetchedAt,
            },
        })
        .returning({
            id: products.id,
            inserted: sql<boolean>`(xmax = 0)`,
            merch: products.isMerchListing,
        });
    if (previous && (previous.merch !== identity.merch || previous.status !== 'active'))
        await notifyKeywordProductRows(database, [identity.id]);
    return { id: identity.id, inserted: identity.inserted };
};

const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};
