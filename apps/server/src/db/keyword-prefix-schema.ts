import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { catalogQueries } from './catalog-search-schema';

// One row per keyword prefix (see services/keyword-prefix.ts), registered when a keyword is
// tracked. A prefix vouches for Brand Analytics searches that name a Merch product, and is expanded
// once through Amazon autocomplete; suggestions that name a Merch product and keep the prefix
// become trials with `prefixAutocomplete` evidence.
export const keywordPrefixes = pgTable(
    'keyword_prefixes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        prefix: text('prefix').notNull(),
        // The tracked keyword the prefix was first registered from.
        firstQueryId: uuid('first_query_id').references(() => catalogQueries.id, {
            onDelete: 'set null',
        }),
        stage: text('stage').$type<'pending' | 'complete'>().notNull().default('pending'),
        // Everything autocomplete suggested for the prefix, and how many became trials.
        suggestions: jsonb('suggestions').$type<string[]>(),
        trialCount: integer('trial_count').notNull().default(0),
        completedAt: timestamp('completed_at', { mode: 'date' }),
        claimToken: uuid('claim_token'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        nextDueAt: timestamp('next_due_at', { mode: 'date' }).notNull().defaultNow(),
        failureCount: integer('failure_count').notNull().default(0),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        prefix: uniqueIndex('keyword_prefixes_prefix_idx').on(table.marketplaceId, table.prefix),
        due: index('keyword_prefixes_due_idx')
            .on(table.nextDueAt)
            .where(sql`${table.stage}<>'complete'`),
        claim: check(
            'keyword_prefixes_claim_check',
            sql`(${table.claimToken} is null)=(${table.claimAt} is null)`
        ),
    })
);
