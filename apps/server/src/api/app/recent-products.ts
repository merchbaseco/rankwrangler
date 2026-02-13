import { desc } from 'drizzle-orm';
import { appProcedure } from '@/api/trpc.js';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';

export const recentProducts = appProcedure.query(async () => {
    const rows = await db
        .select({
            asin: products.asin,
            title: products.title,
            thumbnailUrl: products.thumbnailUrl,
            brand: products.brand,
            marketplaceId: products.marketplaceId,
            rootCategoryBsr: products.rootCategoryBsr,
            lastFetched: products.lastFetched,
        })
        .from(products)
        .orderBy(desc(products.lastFetched))
        .limit(100);

    return rows;
});
