import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';
import type { SpApiProduct } from '@/types/index.js';

export const upsertProductInfo = async (productInfo: SpApiProduct): Promise<void> => {
    const dateFirstAvailable = productInfo.dateFirstAvailable
        ? new Date(productInfo.dateFirstAvailable)
        : null;
    const fetchedAt = new Date(productInfo.fetchedAt);

    await db
        .insert(products)
        .values({
            marketplaceId: productInfo.marketplaceId,
            asin: productInfo.asin,
            dateFirstAvailable,
            thumbnailUrl: productInfo.thumbnailUrl,
            title: productInfo.title,
            brand: productInfo.brand,
            isMerchListing: productInfo.isMerchListing,
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
                isMerchListing: productInfo.isMerchListing,
                bullet1: productInfo.bullet1,
                bullet2: productInfo.bullet2,
                rootCategoryId: preserveExistingOnNull(products.rootCategoryId),
                rootCategoryBsr: preserveExistingOnNull(products.rootCategoryBsr),
                spApiFetchedAt: fetchedAt,
                spApiResolvedAt: fetchedAt,
            },
        });
};

const preserveExistingOnNull = (column: { name: string }) => {
    return sql`COALESCE(${sql.raw(`excluded.${column.name}`)}, ${column})`;
};
