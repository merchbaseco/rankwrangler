import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    real,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import type { DiscoverySource } from '@/services/discovery-types';
import { catalogQueries } from './catalog-search-schema';
import { products } from './product-schema';

export const discoveryTargets = pgTable(
    'discovery_targets',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        queryId: uuid('query_id')
            .notNull()
            .references(() => catalogQueries.id, { onDelete: 'cascade' }),
        kind: text('kind').$type<'keyword' | 'brand'>().notNull(),
        scopeKey: text('scope_key').notNull().default(''),
        brandName: text('brand_name'),
        tracking: text('tracking')
            .$type<'trial' | 'tracked' | 'dropped'>()
            .notNull()
            .default('trial'),
        standingTier: text('standing_tier')
            .$type<'unrated' | 'hot' | 'warm' | 'cold'>()
            .notNull()
            .default('unrated'),
        popularityScore: real('popularity_score'),
        scoreComponents: jsonb('score_components').$type<{
            best: number;
            breadth: number;
        }>(),
        headProductIds: jsonb('head_product_ids').$type<string[]>().notNull().default([]),
        headObservedAt: timestamp('head_observed_at', { mode: 'date' }),
        firstObservedAt: timestamp('first_observed_at', { mode: 'date' }),
        nextCheckAt: timestamp('next_check_at', { mode: 'date' }),
        intervalDays: real('interval_days').notNull().default(7),
        demotionObservedAt: timestamp('demotion_observed_at', { mode: 'date' }),
        demotionCount: integer('demotion_count').notNull().default(0),
        emptyCount: integer('empty_count').notNull().default(0),
        enabled: boolean('enabled').notNull().default(false),
        lastSelectedAt: timestamp('last_selected_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        identity: uniqueIndex('discovery_targets_scope_idx').on(
            table.queryId,
            table.kind,
            table.scopeKey
        ),
        fairness: index('discovery_targets_fairness_idx').on(table.enabled, table.lastSelectedAt),
        shape: check(
            'discovery_targets_shape_check',
            sql`
        (${table.kind}='keyword' and ${table.scopeKey}='' and ${table.brandName} is null)
        or (${table.kind}='brand' and ${table.scopeKey}<>'' and ${table.brandName} is not null
            and length(btrim(${table.brandName}))>0)
    `
        ),
    })
);

/**
 * One row per recorded standing: every page-one keyword observation, plus stored-rank refreshes
 * that changed the score. Feeds score deltas and weekly trends; see keyword-mining.md.
 */
export const keywordStandingObservations = pgTable(
    'keyword_standing_observations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        targetId: uuid('target_id')
            .notNull()
            .references(() => discoveryTargets.id, { onDelete: 'cascade' }),
        queryId: uuid('query_id')
            .notNull()
            .references(() => catalogQueries.id, { onDelete: 'cascade' }),
        observedAt: timestamp('observed_at', { mode: 'date' }).notNull(),
        popularityScore: real('popularity_score'),
        standingTier: text('standing_tier').$type<'unrated' | 'hot' | 'warm' | 'cold'>().notNull(),
        source: text('source').$type<'search' | 'storedRanks'>().notNull(),
    },
    table => ({
        queryObserved: index('keyword_standing_observations_query_observed_idx').on(
            table.queryId,
            table.observedAt
        ),
        sourceCheck: check(
            'keyword_standing_observations_source_check',
            sql`${table.source} in ('search', 'storedRanks')`
        ),
    })
);

export const discoveryEvidence = pgTable(
    'discovery_evidence',
    {
        targetId: uuid('target_id')
            .notNull()
            .references(() => discoveryTargets.id, { onDelete: 'cascade' }),
        kind: text('kind').$type<DiscoverySource>().notNull(),
        sourceKey: text('source_key').notNull(),
        productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }),
        eligible: boolean('eligible').notNull().default(true),
        observedAt: timestamp('observed_at', { mode: 'date' }).notNull(),
        supportCount: integer('support_count').notNull().default(1),
    },
    table => ({
        pk: primaryKey({ columns: [table.targetId, table.kind, table.sourceKey] }),
        product: index('discovery_evidence_product_idx').on(table.productId),
        fresh: index('discovery_evidence_fresh_idx').on(
            table.targetId,
            table.eligible,
            table.observedAt
        ),
    })
);

export const brandDiscoveryProducts = pgTable(
    'brand_discovery_products',
    {
        targetId: uuid('target_id')
            .notNull()
            .references(() => discoveryTargets.id, { onDelete: 'cascade' }),
        productId: uuid('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'restrict' }),
        firstObservedAt: timestamp('first_observed_at', { mode: 'date' }).notNull(),
        lastObservedAt: timestamp('last_observed_at', { mode: 'date' }).notNull(),
    },
    table => ({ pk: primaryKey({ columns: [table.targetId, table.productId] }) })
);

export const discoverySourceScans = pgTable('discovery_source_scans', {
    key: text('key').primaryKey(),
    cursorCreatedAt: timestamp('cursor_created_at', { mode: 'date' }),
    cursorProductId: uuid('cursor_product_id'),
    nextDueAt: timestamp('next_due_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});
