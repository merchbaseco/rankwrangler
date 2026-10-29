import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, jsonb, index, check } from 'drizzle-orm/pg-core';
import { catalogQueries } from './catalog-search-schema';

// Once-per-seed Amazon autocomplete expansion. The saved suggestions record provenance; each one
// became a keyword trial with `autocomplete` discovery evidence naming this seed.
export const keywordAutocomplete = pgTable(
    'keyword_autocomplete',
    {
        queryId: uuid('query_id')
            .primaryKey()
            .references(() => catalogQueries.id, { onDelete: 'cascade' }),
        stage: text('stage').$type<'pending' | 'complete'>().notNull().default('pending'),
        suggestions: jsonb('suggestions').$type<string[]>(),
        suggestedAt: timestamp('suggested_at', { mode: 'date' }),
        completedAt: timestamp('completed_at', { mode: 'date' }),
        claimToken: uuid('claim_token'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        nextDueAt: timestamp('next_due_at', { mode: 'date' }).notNull().defaultNow(),
        failureCount: integer('failure_count').notNull().default(0),
    },
    table => ({
        due: index('keyword_autocomplete_due_idx')
            .on(table.nextDueAt)
            .where(sql`${table.stage}<>'complete'`),
        claim: check(
            'keyword_autocomplete_claim_check',
            sql`(${table.claimToken} is null)=(${table.claimAt} is null)`
        ),
    })
);

// Durable autocomplete pacing and daily ceiling. The table keeps its earlier name, from when it
// also paced Amazon Ads and Jev; autocomplete is now its only provider.
export const keywordProviderCapacity = pgTable('keyword_mining_capacity', {
    provider: text('provider').$type<'autocomplete'>().primaryKey(),
    nextStartAt: timestamp('next_start_at', { mode: 'date' }).notNull().defaultNow(),
    starts: integer('starts').notNull().default(0),
    // Starts admitted on `day` (UTC). Null `dailyLimit` uses the default ceiling.
    dailyLimit: integer('daily_limit'),
    day: text('day'),
    dayStarts: integer('day_starts').notNull().default(0),
    // Adaptive pacing: spacing between starts grows on throttling and eases back on success.
    spacingMs: integer('spacing_ms'),
    consecutiveThrottles: integer('consecutive_throttles').notNull().default(0),
});
