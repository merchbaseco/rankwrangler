import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

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
        isMerchListing: boolean('is_merch_listing'),
        bullet1: text('bullet_1'),
        bullet2: text('bullet_2'),
        rootCategoryId: bigint('root_category_id', { mode: 'number' }),
        rootCategoryBsr: integer('root_category_bsr'),
        facetsState: text('facets_state').notNull().default('pending'),
        facetsUpdatedAt: timestamp('facets_updated_at', { mode: 'date' }),
        spApiFetchedAt: timestamp('sp_api_fetched_at', { mode: 'date' }),
        spApiResolvedAt: timestamp('sp_api_resolved_at', { mode: 'date' }),
        keepaFetchedAt: timestamp('keepa_fetched_at', { mode: 'date' }),
        keepaSourceUpdatedAt: timestamp('keepa_source_updated_at', { mode: 'date' }),
        keepaFirstTrackedAt: timestamp('keepa_first_tracked_at', { mode: 'date' }),
        keepaRootCategoryId: bigint('keepa_root_category_id', { mode: 'number' }),
        keepaCurrentBsr: integer('keepa_current_bsr'),
        keepaCurrentNewPrice: integer('keepa_current_new_price'),
        keepaMonthlySold: integer('keepa_monthly_sold'),
        keepaBsrAverage30: integer('keepa_bsr_average_30'),
        keepaBsrAverage90: integer('keepa_bsr_average_90'),
        keepaSalesRankDrops30: integer('keepa_sales_rank_drops_30'),
        keepaSalesRankDrops90: integer('keepa_sales_rank_drops_90'),
        keepaSalesRankDrops180: integer('keepa_sales_rank_drops_180'),
        keepaSalesRankDrops365: integer('keepa_sales_rank_drops_365'),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        marketplaceAsinIdx: uniqueIndex('products_marketplace_asin_idx').on(
            table.marketplaceId,
            table.asin
        ),
        facetsStateCheck: check(
            'products_facets_state_check',
            sql`${table.facetsState} in ('pending', 'ready', 'error')`
        ),
        keepaRefreshCandidateIdx: index('products_keepa_refresh_candidate_idx').on(
            table.isMerchListing,
            table.rootCategoryBsr,
            table.keepaFetchedAt
        ),
    })
);
