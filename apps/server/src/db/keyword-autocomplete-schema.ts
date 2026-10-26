import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    jsonb,
    index,
    primaryKey,
    check,
} from 'drizzle-orm/pg-core';
import { catalogQueries } from './catalog-search-schema';
import { minedKeywordCandidates } from './keyword-mining-schema';

export const keywordAutocomplete = pgTable(
    'keyword_autocomplete',
    {
        queryId: uuid('query_id')
            .primaryKey()
            .references(() => catalogQueries.id, { onDelete: 'cascade' }),
        stage: text('stage')
            .$type<'pending' | 'suggestionsSaved' | 'complete'>()
            .notNull()
            .default('pending'),
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

export const autocompleteKeywordCandidates = pgTable(
    'autocomplete_keyword_candidates',
    {
        queryId: uuid('query_id')
            .notNull()
            .references(() => keywordAutocomplete.queryId, { onDelete: 'cascade' }),
        candidateId: uuid('candidate_id')
            .notNull()
            .references(() => minedKeywordCandidates.id, { onDelete: 'cascade' }),
    },
    table => ({ pk: primaryKey({ columns: [table.queryId, table.candidateId] }) })
);
