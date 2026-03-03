import {
    bigint,
    boolean,
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
import { sql } from 'drizzle-orm';

export const licenses = pgTable(
    'licenses',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: text('key').notNull(),
        email: text('email').notNull(),
        createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
        revokedAt: timestamp('revokedAt', { mode: 'date' }),
        lastUsedAt: timestamp('lastUsedAt', { mode: 'date' }),
        usageToday: integer('usageToday').notNull().default(0),
        usageCount: integer('usageCount').notNull().default(0),
        usageLimit: integer('usageLimit').notNull().default(100000),
        lastResetAt: timestamp('lastResetAt', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        keyIdx: uniqueIndex('licenses_key_unique').on(table.key),
        emailIdx: index('licenses_email_idx').on(table.email),
        revokedIdx: index('licenses_revoked_at_idx').on(table.revokedAt),
    })
);

// Products table - local product store populated from SP-API
export const products = pgTable(
    'products',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        dateFirstAvailable: timestamp('date_first_available', { mode: 'date' }),
        thumbnailUrl: text('thumbnail_url'),
        title: text('title'),
        brand: text('brand'),
        isMerchListing: boolean('is_merch_listing').notNull().default(false),
        bullet1: text('bullet_1'),
        bullet2: text('bullet_2'),
        rootCategoryId: bigint('root_category_id', { mode: 'number' }),
        rootCategoryBsr: integer('root_category_bsr'),
        facetsState: text('facets_state').notNull().default('pending'),
        facetsUpdatedAt: timestamp('facets_updated_at', { mode: 'date' }),
        lastFetched: timestamp('last_fetched', { mode: 'date' }).notNull().defaultNow(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        // Composite unique index for marketplace + asin
        marketplaceAsinIdx: uniqueIndex('products_marketplace_asin_idx').on(
            table.marketplaceId,
            table.asin
        ),
        facetsStateCheck: check(
            'products_facets_state_check',
            sql`${table.facetsState} in ('pending', 'ready', 'error')`
        ),
    })
);

const productFacetAllowedValuesSql = [
    'profession',
    'hobby',
    'animal',
    'food',
    'cause',
    'identity',
    'culture',
    'holiday',
    'occasion',
    'place',
    'party-theme',
]
    .map(value => `'${value.replace(/'/g, "''")}'`)
    .join(',');

export const productFacetValues = pgTable(
    'product_facet_values',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        facet: text('facet').notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        facetAllowedValuesCheck: check(
            'product_facet_values_facet_check',
            sql`${table.facet} in (${sql.raw(productFacetAllowedValuesSql)})`
        ),
        facetNameUniqueIdx: uniqueIndex('product_facet_values_facet_name_unique_idx').on(
            table.facet,
            table.name
        ),
        facetNameIdx: index('product_facet_values_facet_name_idx').on(table.facet, table.name),
    })
);

export const productFacets = pgTable(
    'product_facets',
    {
        productId: uuid('product_id')
            .references(() => products.id, { onDelete: 'cascade' })
            .notNull(),
        facetValueId: uuid('facet_value_id')
            .references(() => productFacetValues.id, { onDelete: 'cascade' })
            .notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        pk: primaryKey({ columns: [table.productId, table.facetValueId], name: 'product_facets_pk' }),
        facetValueIdx: index('product_facets_facet_value_idx').on(table.facetValueId),
    })
);

// SP-API sync queue table (backed by legacy `product_ingest_queue` table name)
export const spApiSyncQueue = pgTable(
    'product_ingest_queue',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        marketplaceAsinIdx: uniqueIndex('product_ingest_queue_marketplace_asin_idx').on(
            table.marketplaceId,
            table.asin
        ),
        createdAtIdx: index('product_ingest_queue_created_at_idx').on(table.createdAt),
    })
);

export const keepaHistoryRefreshQueue = pgTable(
    'keepa_history_refresh_queue',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        nextAttemptAt: timestamp('next_attempt_at', { mode: 'date' }).notNull().defaultNow(),
        attemptCount: integer('attempt_count').notNull().default(0),
        lastAttemptAt: timestamp('last_attempt_at', { mode: 'date' }),
        lastError: text('last_error'),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        marketplaceAsinIdx: uniqueIndex('keepa_history_refresh_queue_marketplace_asin_idx').on(
            table.marketplaceId,
            table.asin
        ),
        nextAttemptCreatedIdx: index('keepa_history_refresh_queue_next_attempt_created_idx').on(
            table.nextAttemptAt,
            table.createdAt
        ),
    })
);

export const productHistoryImports = pgTable(
    'product_history_imports',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        productId: uuid('product_id')
            .references(() => products.id, { onDelete: 'cascade' })
            .notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        source: text('source').notNull(),
        status: text('status').notNull(),
        requestParams: jsonb('request_params').$type<Record<string, unknown>>().notNull(),
        responsePayload: jsonb('response_payload').$type<Record<string, unknown> | null>(),
        tokensConsumed: integer('tokens_consumed'),
        tokensLeft: integer('tokens_left'),
        refillInMs: integer('refill_in_ms'),
        refillRate: integer('refill_rate'),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        productCreatedAtIdx: index('product_history_imports_product_created_at_idx').on(
            table.productId,
            table.createdAt
        ),
        marketplaceAsinCreatedAtIdx: index('product_history_imports_marketplace_asin_created_at_idx').on(
            table.marketplaceId,
            table.asin,
            table.createdAt
        ),
    })
);

export const productHistoryPoints = pgTable(
    'product_history_points',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        productId: uuid('product_id')
            .references(() => products.id, { onDelete: 'cascade' })
            .notNull(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        source: text('source').notNull(),
        metric: text('metric').notNull(),
        categoryId: bigint('category_id', { mode: 'number' }).notNull().default(-1),
        observedAt: timestamp('observed_at', { mode: 'date' }).notNull(),
        keepaMinutes: integer('keepa_minutes').notNull(),
        valueInt: integer('value_int'),
        isMissing: boolean('is_missing').notNull().default(false),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        uniquePointIdx: uniqueIndex('product_history_points_unique_idx').on(
            table.productId,
            table.source,
            table.metric,
            table.categoryId,
            table.keepaMinutes
        ),
        marketplaceAsinMetricObservedAtIdx: index('product_history_points_marketplace_asin_metric_observed_at_idx').on(
            table.marketplaceId,
            table.asin,
            table.metric,
            table.observedAt
        ),
    })
);

export const keepaCategories = pgTable(
    'keepa_categories',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        categoryId: bigint('category_id', { mode: 'number' }).notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        marketplaceCategoryIdx: uniqueIndex('keepa_categories_marketplace_category_idx').on(
            table.marketplaceId,
            table.categoryId
        ),
        marketplaceNameIdx: index('keepa_categories_marketplace_name_idx').on(
            table.marketplaceId,
            table.name
        ),
    })
);

export {
    eventLogs,
    jobExecutionLogs,
    jobExecutions,
} from './ops-schema';
export {
    topSearchTermsDatasets,
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
} from './top-search-terms-schema';
