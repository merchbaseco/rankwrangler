import { sql } from 'drizzle-orm';
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
import { products } from './product-schema';

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
        pk: primaryKey({
            columns: [table.productId, table.facetValueId],
            name: 'product_facets_pk',
        }),
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
        marketplaceAsinCreatedAtIdx: index(
            'product_history_imports_marketplace_asin_created_at_idx'
        ).on(table.marketplaceId, table.asin, table.createdAt),
    })
);

/**
 * Keepa history, one row per Product, source, metric and category: the whole series as two parallel
 * integer arrays in Keepa's own coordinates, minutes ascending (decoded by
 * `services/keepa-history-series.ts`). Writers merge a fetched series into the stored one, so
 * history older than a fetch's window survives it.
 */
export const productHistorySeries = pgTable(
    'product_history_series',
    {
        productId: uuid('product_id')
            .references(() => products.id, { onDelete: 'cascade' })
            .notNull(),
        source: text('source').notNull(),
        metric: text('metric').notNull(),
        categoryId: bigint('category_id', { mode: 'number' }).notNull().default(-1),
        keepaMinutes: integer('keepa_minutes').array().notNull(),
        keepaValues: integer('keepa_values').array().notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        pk: primaryKey({
            columns: [table.productId, table.source, table.metric, table.categoryId],
        }),
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

export { accessProjection, accessProjectionEvents } from './access-schema';
export { automaticSyncControl } from './automatic-sync-schema';
export { brandAnalyticsImports, brandAnalyticsSearchTerms } from './brand-analytics-schema';
export {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
} from './catalog-search-schema';
export { rankwranglerCutoverGate } from './cutover-gate-schema';
export {
    brandDiscoveryProducts,
    discoveryEvidence,
    discoverySourceScans,
    discoveryTargets,
    keywordStandingObservations,
} from './discovery-target-schema';
export { historyAdmissionRollouts } from './history-admission-rollout-schema';
export { keepaCapacityAttempts, keepaCapacityState } from './keepa-capacity-schema';
export { keywordAutocomplete, keywordProviderCapacity } from './keyword-autocomplete-schema';
export { keywordPrefixes } from './keyword-prefix-schema';
export {
    keywordDiscoveryAttempts,
    keywordExplorationPasses,
    keywordProducts,
} from './keyword-collection-schema';
export { officialBrands } from './official-brand-schema';
export {
    eventLogs,
    jobExecutionLogs,
    jobExecutions,
    operations,
} from './ops-schema';
export { productCutoutThumbnails } from './product-cutout-thumbnail-schema';
export { products } from './product-schema';
export { productShortNames } from './product-short-name-schema';
export { providerAttempts } from './provider-telemetry-schema';
export { rankwranglerServiceAccounts } from './service-account-schema';
export { spApiCatalogCapacity } from './spapi-capacity-schema';
