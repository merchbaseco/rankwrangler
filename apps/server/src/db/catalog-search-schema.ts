import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { operations } from './ops-schema';
import { products } from './product-schema';

export const catalogQueries = pgTable(
    'catalog_queries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        source: text('source').notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        normalizedTerm: text('normalized_term').notNull(),
        displayTerm: text('display_term').notNull(),
        page: integer('page').notNull(),
        latestSuccessfulRunAt: timestamp('latest_successful_run_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        identityIdx: uniqueIndex('catalog_queries_identity_idx').on(
            table.source,
            table.marketplaceId,
            table.normalizedTerm,
            table.page
        ),
        v1IdentityCheck: check(
            'catalog_queries_v1_identity_check',
            sql`${table.source} = 'keepa' AND ${table.marketplaceId} = 'ATVPDKIKX0DER' AND ${table.page} = 0`
        ),
    })
);

export const catalogSearchRuns = pgTable(
    'catalog_search_runs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        queryId: uuid('query_id')
            .references(() => catalogQueries.id, { onDelete: 'cascade' })
            .notNull(),
        operationId: uuid('operation_id')
            .references(() => operations.id)
            .notNull(),
        sourceStartedAt: timestamp('source_started_at', { mode: 'date' }).notNull(),
        sourceCompletedAt: timestamp('source_completed_at', { mode: 'date' }).notNull(),
        resultCount: integer('result_count').notNull(),
        normalizerVersion: integer('normalizer_version').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        operationIdx: uniqueIndex('catalog_search_runs_operation_idx').on(table.operationId),
        queryCreatedAtIdx: index('catalog_search_runs_query_created_at_idx').on(
            table.queryId,
            table.createdAt
        ),
        resultCountCheck: check(
            'catalog_search_runs_result_count_check',
            sql`${table.resultCount} >= 0 AND ${table.resultCount} <= 20`
        ),
    })
);

export const catalogSearchResults = pgTable(
    'catalog_search_results',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        runId: uuid('run_id')
            .references(() => catalogSearchRuns.id, { onDelete: 'cascade' })
            .notNull(),
        productId: uuid('product_id')
            .references(() => products.id, { onDelete: 'restrict' })
            .notNull(),
        sourcePosition: integer('source_position').notNull(),
        observedRootCategoryBsr: integer('observed_root_category_bsr'),
        observedNewPrice: integer('observed_new_price'),
        observedMonthlySold: integer('observed_monthly_sold'),
        observedBsrAverage30: integer('observed_bsr_average_30'),
        observedBsrAverage90: integer('observed_bsr_average_90'),
        observedSalesRankDrops30: integer('observed_sales_rank_drops_30'),
        observedSalesRankDrops90: integer('observed_sales_rank_drops_90'),
        observedSalesRankDrops180: integer('observed_sales_rank_drops_180'),
        observedSalesRankDrops365: integer('observed_sales_rank_drops_365'),
        observedSourceUpdatedAt: timestamp('observed_source_updated_at', {
            mode: 'date',
        }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        runProductIdx: uniqueIndex('catalog_search_results_run_product_idx').on(
            table.runId,
            table.productId
        ),
        runPositionIdx: uniqueIndex('catalog_search_results_run_position_idx').on(
            table.runId,
            table.sourcePosition
        ),
        positionCheck: check(
            'catalog_search_results_source_position_check',
            sql`${table.sourcePosition} >= 1 AND ${table.sourcePosition} <= 20`
        ),
    })
);
