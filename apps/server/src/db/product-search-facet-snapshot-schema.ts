import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';

/**
 * Explore's default-view facets (sidebar counts and KPI bands), counted exactly over every
 * matching Product by the `refresh-product-search-facets` job and read back as one row, so the
 * view every dashboard visit opens on never aggregates the catalog in a request. No row means the
 * first count has not run.
 */
export const productSearchFacetSnapshot = pgTable(
    'product_search_facet_snapshot',
    {
        id: integer('id').primaryKey(),
        observedAt: timestamp('observed_at', { mode: 'date' }).notNull(),
        facets: jsonb('facets').$type<unknown>().notNull(),
    },
    table => ({
        singleton: check('product_search_facet_snapshot_singleton', sql`${table.id} = 1`),
    })
);
