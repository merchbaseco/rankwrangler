import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { catalogQueries } from './catalog-search-schema';
import { products } from './product-schema';

export const keywordExplorationPasses = pgTable(
    'keyword_exploration_passes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        queryId: uuid('query_id')
            .references(() => catalogQueries.id, { onDelete: 'cascade' })
            .notNull(),
        source: text('source').notNull().default('spapi'),
        nextPageToken: text('next_page_token'),
        lastPageFingerprint: text('last_page_fingerprint'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        failureCount: integer('failure_count').notNull().default(0),
        nextPage: integer('next_page').notNull().default(0),
        contiguousPages: integer('contiguous_pages').notNull().default(0),
        oldestPageAt: timestamp('oldest_page_at', { mode: 'date' }),
        lastPageAt: timestamp('last_page_at', { mode: 'date' }),
        lowYieldPages: integer('low_yield_pages').notNull().default(0),
        stopReason: text('stop_reason').notNull().default('running'),
        resumeAt: timestamp('resume_at', { mode: 'date' }).notNull().defaultNow(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        queryCreatedIdx: index('keyword_exploration_query_created_idx').on(
            table.queryId,
            table.createdAt
        ),
        activeQueryIdx: uniqueIndex('keyword_exploration_active_query_idx')
            .on(table.queryId)
            .where(sql`${table.stopReason} in ('running', 'budget', 'jobCap')`),
        pageCheck: check(
            'keyword_exploration_page_check',
            sql`${table.nextPage} >= 0 AND ${table.contiguousPages} >= 0`
        ),
    })
);

export const keywordProducts = pgTable(
    'keyword_products',
    {
        queryId: uuid('query_id')
            .references(() => catalogQueries.id, { onDelete: 'cascade' })
            .notNull(),
        productId: uuid('product_id')
            .references(() => products.id, { onDelete: 'restrict' })
            .notNull(),
        firstObservedAt: timestamp('first_observed_at', { mode: 'date' }).notNull(),
        lastObservedAt: timestamp('last_observed_at', { mode: 'date' }).notNull(),
    },
    table => ({
        membershipIdx: uniqueIndex('keyword_products_membership_idx').on(
            table.queryId,
            table.productId
        ),
        productIdx: index('keyword_products_product_idx').on(table.productId),
    })
);

export const keywordDiscoveryAttempts = pgTable(
    'keyword_discovery_attempts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        queryId: uuid('query_id')
            .references(() => catalogQueries.id, { onDelete: 'cascade' })
            .notNull(),
        passId: uuid('pass_id')
            .references(() => keywordExplorationPasses.id, { onDelete: 'cascade' })
            .notNull(),
        attemptedAt: timestamp('attempted_at', { mode: 'date' }).notNull().defaultNow(),
        page: integer('page').notNull(),
        status: text('status').notNull().default('reserved'),
    },
    table => ({
        attemptedIdx: index('keyword_discovery_attempted_idx').on(table.attemptedAt),
        queryAttemptedIdx: index('keyword_discovery_query_attempted_idx').on(
            table.queryId,
            table.attemptedAt
        ),
    })
);
