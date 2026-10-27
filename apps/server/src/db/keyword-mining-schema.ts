import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    index,
    real,
    jsonb,
    primaryKey,
    uniqueIndex,
    check,
    boolean,
} from 'drizzle-orm/pg-core';
import { products } from './product-schema';

export const productKeywordMining = pgTable(
    'product_keyword_mining',
    {
        productId: uuid('product_id')
            .primaryKey()
            .references(() => products.id, { onDelete: 'cascade' }),
        stage: text('stage')
            .$type<'pending' | 'recommendationsSaved' | 'complete'>()
            .notNull()
            .default('pending'),
        recommendations: jsonb('recommendations').$type<string[]>(),
        claimToken: uuid('claim_token'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        nextDueAt: timestamp('next_due_at', { mode: 'date' }).notNull().defaultNow(),
        failureCount: integer('failure_count').notNull().default(0),
        recommendedAt: timestamp('recommended_at', { mode: 'date' }),
        selectionVersion: text('selection_version'),
        completedAt: timestamp('completed_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        due: index('product_keyword_mining_due_idx')
            .on(table.nextDueAt)
            .where(sql`${table.stage}<>'complete'`),
        claim: check(
            'product_keyword_mining_claim_check',
            sql`(${table.claimToken} is null)=(${table.claimAt} is null)`
        ),
    })
);

export const minedKeywordCandidates = pgTable(
    'mined_keyword_candidates',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        term: text('term').notNull(),
        verdict: text('verdict').$type<'accepted' | 'rejected'>(),
        probability: real('probability'),
        judgeVersion: text('judge_version'),
        judgedAt: timestamp('judged_at', { mode: 'date' }),
        claimToken: uuid('claim_token'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        identity: uniqueIndex('mined_keyword_candidates_identity_idx').on(
            table.marketplaceId,
            table.term
        ),
    })
);

export const productKeywordCandidates = pgTable(
    'product_keyword_candidates',
    {
        productId: uuid('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'cascade' }),
        candidateId: uuid('candidate_id')
            .notNull()
            .references(() => minedKeywordCandidates.id, { onDelete: 'cascade' }),
        position: integer('position'),
        relevance: real('relevance'),
        selected: boolean('selected').notNull().default(false),
    },
    table => ({ pk: primaryKey({ columns: [table.productId, table.candidateId] }) })
);

export const keywordMiningCapacity = pgTable('keyword_mining_capacity', {
    provider: text('provider').$type<'ads' | 'jev' | 'autocomplete'>().primaryKey(),
    nextStartAt: timestamp('next_start_at', { mode: 'date' }).notNull().defaultNow(),
    starts: integer('starts').notNull().default(0),
});
