import { and, eq, notExists } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { catalogSearchResults, products } from '@/db/schema.js';

export async function deleteProductByMarketplaceAsin(
    marketplaceId: string,
    asin: string
): Promise<boolean> {
    const deletedRows = await db
        .delete(products)
        .where(
            and(
                eq(products.marketplaceId, marketplaceId),
                eq(products.asin, asin),
                notExists(
                    db
                        .select({ id: catalogSearchResults.id })
                        .from(catalogSearchResults)
                        .where(eq(catalogSearchResults.productId, products.id))
                )
            )
        )
        .returning({ id: products.id });

    return deletedRows.length > 0;
}
