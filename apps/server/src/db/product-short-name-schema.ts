import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { products } from './product-schema';

export const productShortNames = pgTable(
    'product_short_names',
    {
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        inputFingerprint: text('input_fingerprint').notNull(),
        state: text('state').$type<'pending' | 'ready' | 'error'>().notNull(),
        shortName: text('short_name'),
        claimId: uuid('claim_id').notNull(),
        attemptedAt: timestamp('attempted_at', { mode: 'date' }).notNull(),
        completedAt: timestamp('completed_at', { mode: 'date' }),
    },
    table => ({
        pk: primaryKey({ columns: [table.marketplaceId, table.asin] }),
        productFk: foreignKey({
            columns: [table.marketplaceId, table.asin],
            foreignColumns: [products.marketplaceId, products.asin],
        }).onDelete('cascade'),
        stateCheck: check(
            'product_short_names_state_check',
            sql`${table.state} in ('pending', 'ready', 'error')`
        ),
    })
);
