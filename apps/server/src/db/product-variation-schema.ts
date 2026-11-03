import { sql } from 'drizzle-orm';
import {
    check,
    index,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

export interface StoredVariationChild {
    readonly asin: string;
    readonly attributes: Readonly<Record<string, string>>;
}

/**
 * On-request variation family snapshot for `product.get` include `variations`.
 * Keyed by Amazon parent ASIN. No foreign key to `products`: the parent may not be stored yet,
 * and this path must not depend on `product_asin_aliases`.
 */
export const productVariations = pgTable(
    'product_variations',
    {
        marketplaceId: text('marketplace_id').notNull(),
        parentAsin: text('parent_asin').notNull(),
        generatorVersion: text('generator_version').notNull(),
        state: text('state').$type<'pending' | 'ready' | 'error'>().notNull(),
        kind: text('kind').$type<'family' | 'none'>(),
        theme: jsonb('theme').$type<readonly string[]>(),
        children: jsonb('children').$type<readonly StoredVariationChild[]>(),
        memberAsins: text('member_asins').array().notNull(),
        claimId: uuid('claim_id').notNull(),
        attemptedAt: timestamp('attempted_at', { mode: 'date' }).notNull(),
        fetchedAt: timestamp('fetched_at', { mode: 'date' }),
    },
    table => ({
        pk: primaryKey({ columns: [table.marketplaceId, table.parentAsin] }),
        membersIdx: index('product_variations_member_asins_idx').using('gin', table.memberAsins),
        stateCheck: check(
            'product_variations_state_check',
            sql`${table.state} in ('pending', 'ready', 'error')`
        ),
        kindCheck: check(
            'product_variations_kind_check',
            sql`${table.kind} is null or ${table.kind} in ('family', 'none')`
        ),
    })
);
