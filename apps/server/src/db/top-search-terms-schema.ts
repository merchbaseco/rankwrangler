import {
    boolean,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

export const topSearchTermsDatasets = pgTable(
    'top_search_terms_datasets',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        reportPeriod: text('report_period').notNull(),
        dataStartDate: text('data_start_date').notNull(),
        dataEndDate: text('data_end_date').notNull(),
        status: text('status').notNull().default('idle'),
        refreshing: boolean('refreshing').notNull().default(false),
        activeJobId: text('active_job_id'),
        activeJobRequestedAt: timestamp('active_job_requested_at', { mode: 'date' }),
        fetchStartedAt: timestamp('fetch_started_at', { mode: 'date' }),
        lastCompletedAt: timestamp('last_completed_at', { mode: 'date' }),
        lastFailedAt: timestamp('last_failed_at', { mode: 'date' }),
        lastError: text('last_error'),
        reportId: text('report_id'),
        nextRefreshAt: timestamp('next_refresh_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        windowIdx: uniqueIndex('top_search_terms_datasets_window_idx').on(
            table.marketplaceId,
            table.reportPeriod,
            table.dataStartDate,
            table.dataEndDate
        ),
        dueIdx: index('top_search_terms_datasets_due_idx').on(
            table.marketplaceId,
            table.reportPeriod,
            table.nextRefreshAt
        ),
        statusUpdatedIdx: index('top_search_terms_datasets_status_updated_idx').on(
            table.status,
            table.updatedAt
        ),
    })
);

export const topSearchTermsSnapshots = pgTable(
    'top_search_terms_snapshots',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        datasetId: uuid('dataset_id')
            .references(() => topSearchTermsDatasets.id, { onDelete: 'cascade' })
            .notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        reportPeriod: text('report_period').notNull(),
        dataStartDate: text('data_start_date').notNull(),
        dataEndDate: text('data_end_date').notNull(),
        observedDate: text('observed_date').notNull(),
        reportId: text('report_id').notNull(),
        sourceJobId: text('source_job_id').notNull(),
        keywordCount: integer('keyword_count').notNull().default(0),
        fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        observedIdx: uniqueIndex('top_search_terms_snapshots_dataset_observed_idx').on(
            table.datasetId,
            table.observedDate
        ),
        datasetFetchedIdx: index('top_search_terms_snapshots_dataset_fetched_idx').on(
            table.datasetId,
            table.fetchedAt
        ),
    })
);

export const topSearchTermsKeywordDaily = pgTable(
    'top_search_terms_keyword_daily',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        snapshotId: uuid('snapshot_id')
            .references(() => topSearchTermsSnapshots.id, { onDelete: 'cascade' })
            .notNull(),
        datasetId: uuid('dataset_id')
            .references(() => topSearchTermsDatasets.id, { onDelete: 'cascade' })
            .notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        reportPeriod: text('report_period').notNull(),
        dataStartDate: text('data_start_date').notNull(),
        dataEndDate: text('data_end_date').notNull(),
        observedDate: text('observed_date').notNull(),
        searchTerm: text('search_term').notNull(),
        searchFrequencyRank: integer('search_frequency_rank').notNull(),
        clickShareTop3SumBasisPoints: integer('click_share_top3_sum_basis_points').notNull(),
        conversionShareTop3SumBasisPoints: integer('conversion_share_top3_sum_basis_points').notNull(),
        topRowsCount: integer('top_rows_count').notNull().default(1),
        isMerchRelevant: boolean('is_merch_relevant').notNull().default(true),
        merchReason: text('merch_reason').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        snapshotTermIdx: uniqueIndex('top_search_terms_keyword_daily_snapshot_term_idx').on(
            table.snapshotId,
            table.searchTerm
        ),
        snapshotRankIdx: index('top_search_terms_keyword_daily_snapshot_rank_idx').on(
            table.snapshotId,
            table.searchFrequencyRank,
            table.searchTerm
        ),
        datasetRankIdx: index('top_search_terms_keyword_daily_dataset_rank_idx').on(
            table.datasetId,
            table.searchFrequencyRank
        ),
    })
);
