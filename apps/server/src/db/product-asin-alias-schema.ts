import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { products } from './product-schema';

/**
 * Variant ASINs (sizes, colors) of a stored family. A lookup or scan that meets a variant resolves
 * to its family here without a provider call; the family row itself is keyed by the parent ASIN.
 */
export const productAsinAliases = pgTable(
    'product_asin_aliases',
    {
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        productId: uuid('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        pk: primaryKey({ columns: [table.marketplaceId, table.asin] }),
        product: index('product_asin_aliases_product_idx').on(table.productId),
    })
);
