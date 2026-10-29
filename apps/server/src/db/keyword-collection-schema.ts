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
import { discoveryTargets } from './discovery-target-schema';

export const keywordExplorationPasses = pgTable(
    'keyword_exploration_passes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        targetId: uuid('target_id')
            .references(() => discoveryTargets.id, { onDelete: 'cascade' })
            .notNull(),
        source: text('source').notNull().default('spapi'),
        nextPageToken: text('next_page_token'),
        lastPageFingerprint: text('last_page_fingerprint'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        claimToken: uuid('claim_token'),
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
        queryCreatedIdx: index('keyword_exploration_target_created_idx').on(
            table.targetId,
            table.createdAt
        ),
        activeQueryIdx: uniqueIndex('keyword_exploration_active_target_idx')
            .on(table.targetId)
            .where(sql`${table.stopReason} in ('running', 'budget', 'jobCap')`),
        claimCheck: check(
            'keyword_exploration_claim_check',
            sql`(${table.claimAt} is null) = (${table.claimToken} is null)`
        ),
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
        passId: uuid('pass_id')
            .references(() => keywordExplorationPasses.id, { onDelete: 'cascade' })
            .notNull(),
        claimToken: uuid('claim_token'),
        attemptedAt: timestamp('attempted_at', { mode: 'date' }).notNull().defaultNow(),
        page: integer('page').notNull(),
        status: text('status').notNull().default('reserved'),
        startedAt: timestamp('started_at', { mode: 'date' }),
        finishedAt: timestamp('finished_at', { mode: 'date' }),
        resultCount: integer('result_count'),
        newProducts: integer('new_products'),
        newMerchProducts: integer('new_merch_products'),
        knownMerch: integer('known_merch'),
        unknownProducts: integer('unknown_products'),
        nonMerchProducts: integer('non_merch_products'),
        newMerchMemberships: integer('new_merch_memberships'),
    },
    table => ({
        activePage: uniqueIndex('keyword_discovery_active_page_idx')
            .on(table.passId, table.page, table.claimToken)
            .where(sql`${table.status} in ('reserved','started','fetched')`),
        acceptedPage: uniqueIndex('keyword_discovery_accepted_page_idx')
            .on(table.passId, table.page)
            .where(sql`${table.status}='accepted' and ${table.finishedAt} is not null`),
        attemptedIdx: index('keyword_discovery_attempted_idx').on(table.attemptedAt),
        queryAttemptedIdx: index('keyword_discovery_pass_attempted_idx').on(
            table.passId,
            table.attemptedAt
        ),
    })
);
