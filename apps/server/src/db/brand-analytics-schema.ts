import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

// One row per kept Brand Analytics search term (latest values only, no weekly history). Weeks are
// Sunday dates (`YYYY-MM-DD`); the rank and clicked products come from `lastSeenWeek`.
export const brandAnalyticsSearchTerms = pgTable(
    'brand_analytics_search_terms',
    {
        marketplaceId: text('marketplace_id').notNull(),
        normalizedTerm: text('normalized_term').notNull(),
        searchFrequencyRank: integer('search_frequency_rank').notNull(),
        apparelClicks: integer('apparel_clicks').notNull(),
        clickedAsins: jsonb('clicked_asins').$type<string[]>().notNull(),
        firstSeenWeek: text('first_seen_week').notNull(),
        lastSeenWeek: text('last_seen_week').notNull(),
        // Set once the term is registered as a keyword trial; the scheduler registers the most
        // searched unregistered terms first while scan backlog allows.
        registeredAt: timestamp('registered_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        pk: primaryKey({ columns: [table.marketplaceId, table.normalizedTerm] }),
        unregistered: index('brand_analytics_search_terms_unregistered_idx')
            .on(table.searchFrequencyRank)
            .where(sql`${table.registeredAt} is null`),
        rank: check(
            'brand_analytics_search_terms_rank_check',
            sql`${table.searchFrequencyRank} > 0 and ${table.apparelClicks} between 1 and 3`
        ),
    })
);

// One row per requested weekly report: the import's durable state machine and its counts.
export const brandAnalyticsImports = pgTable(
    'brand_analytics_imports',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        weekStart: text('week_start').notNull(),
        weekEnd: text('week_end').notNull(),
        status: text('status')
            .$type<'pending' | 'requested' | 'ready' | 'imported' | 'superseded'>()
            .notNull()
            .default('pending'),
        reportId: text('report_id'),
        reportDocumentId: text('report_document_id'),
        // Amazon's last reported processingStatus (IN_QUEUE, IN_PROGRESS, DONE, CANCELLED, FATAL).
        reportStatus: text('report_status'),
        nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }).notNull().defaultNow(),
        failureCount: integer('failure_count').notNull().default(0),
        lastError: text('last_error'),
        claimToken: uuid('claim_token'),
        claimAt: timestamp('claim_at', { mode: 'date' }),
        rows: integer('rows'),
        terms: integer('terms'),
        keptTerms: integer('kept_terms'),
        newTerms: integer('new_terms'),
        requestedAt: timestamp('requested_at', { mode: 'date' }),
        importedAt: timestamp('imported_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        week: uniqueIndex('brand_analytics_imports_week_idx').on(
            table.marketplaceId,
            table.weekStart
        ),
        claim: check(
            'brand_analytics_imports_claim_check',
            sql`(${table.claimToken} is null)=(${table.claimAt} is null)`
        ),
    })
);
