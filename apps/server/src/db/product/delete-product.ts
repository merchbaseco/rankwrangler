import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { products } from '@/db/schema.js';

export async function deleteProductByMarketplaceAsin(
    marketplaceId: string,
    asin: string
): Promise<boolean> {
    const deletedRows = await db
        .delete(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)))
        .returning({ id: products.id });

    return deletedRows.length > 0;
}
