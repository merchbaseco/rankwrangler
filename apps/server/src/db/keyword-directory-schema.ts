import { sql } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    pgTable,
    real,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { catalogQueries } from './catalog-search-schema';
import { discoveryTargets } from './discovery-target-schema';

/**
 * One narrow row per keyword target holding everything the Keywords directory filters, sorts and
 * counts by, so its reads scan a small table that stays in shared buffers instead of joining the
 * wide target rows, every keyword's latest pass and its Products per request. Derived, not owned:
 * `syncKeywordTargets` rewrites the target and pass columns in the same transaction as every write
 * to them, and the measures when a page is accepted (Product and Merch counts and the shelf) or
 * the standing refresh rereads the shelf. Time-relative state (freshness, the fresh count) is
 * still computed at read time from these columns.
 */
export const keywordDirectory = pgTable(
    'keyword_directory',
    {
        queryId: uuid('query_id')
            .primaryKey()
            .references(() => catalogQueries.id, { onDelete: 'cascade' }),
        targetId: uuid('target_id')
            .notNull()
            .references(() => discoveryTargets.id, { onDelete: 'cascade' }),
        marketplaceId: text('marketplace_id').notNull(),
        term: text('term').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
        targetCreatedAt: timestamp('target_created_at', { mode: 'date' }).notNull(),
        tracking: text('tracking').$type<'trial' | 'tracked' | 'dropped'>().notNull(),
        enabled: boolean('enabled').notNull(),
        standingTier: text('standing_tier').$type<'unrated' | 'hot' | 'warm' | 'cold'>().notNull(),
        popularityScore: real('popularity_score'),
        intervalDays: real('interval_days').notNull(),
        nextCheckAt: timestamp('next_check_at', { mode: 'date' }),
        headObservedAt: timestamp('head_observed_at', { mode: 'date' }),
        // The latest exploration pass: its claim, failures, whether it continues past this page,
        // when it resumes and when it last accepted a page.
        passClaimedAt: timestamp('pass_claimed_at', { mode: 'date' }),
        passFailures: integer('pass_failures').notNull().default(0),
        passContinuing: boolean('pass_continuing').notNull().default(false),
        passResumeAt: timestamp('pass_resume_at', { mode: 'date' }),
        passLastPageAt: timestamp('pass_last_page_at', { mode: 'date' }),
        // Retained Products and active Merch listings among them, as of the last accepted page.
        productCount: integer('product_count').notNull().default(0),
        merchCount: integer('merch_count').notNull().default(0),
        // The shelf (first ten active Merch head Products): median BSR, Elite-tier count and the
        // first-available dates the fresh count is read from.
        shelfMedianBsr: integer('shelf_median_bsr'),
        shelfEliteCount: integer('shelf_elite_count').notNull().default(0),
        shelfFirstAvailable: timestamp('shelf_first_available', { mode: 'date' })
            .array()
            .notNull()
            .default(sql`'{}'::timestamp[]`),
    },
    table => ({
        target: uniqueIndex('keyword_directory_target_idx').on(table.targetId),
        term: index('keyword_directory_term_idx').on(table.term),
    })
);
