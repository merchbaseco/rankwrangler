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

// One row per keyword theme (see services/keyword-theme.ts), registered when a keyword is tracked.
// A theme vouches for Brand Analytics searches that name a Merch product, and is expanded once
// through Amazon autocomplete; suggestions that name a Merch product and keep the theme become
// trials with `themeAutocomplete` evidence.
export const keywordThemes = pgTable(
    'keyword_themes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        theme: text('theme').notNull(),
        // The tracked keyword the theme was first registered from.
        firstQueryId: uuid('first_query_id').references(() => catalogQueries.id, {
            onDelete: 'set null',
        }),
        stage: text('stage').$type<'pending' | 'complete'>().notNull().default('pending'),
        // Everything autocomplete suggested for the theme, and how many became trials.
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
        theme: uniqueIndex('keyword_themes_theme_idx').on(table.marketplaceId, table.theme),
        due: index('keyword_themes_due_idx')
            .on(table.nextDueAt)
            .where(sql`${table.stage}<>'complete'`),
        claim: check(
            'keyword_themes_claim_check',
            sql`(${table.claimToken} is null)=(${table.claimAt} is null)`
        ),
    })
);
