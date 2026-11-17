import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';

/** One provider operation's calls from the attempt log, as of the snapshot. */
export interface ProviderCallCounts {
    provider: string;
    operation: string;
    calls1h: number;
    calls24h: number;
    throttled24h: number;
    errors24h: number;
}

/**
 * The latest whole-catalog counts, one row rewritten by the `refresh-product-stats` job from a
 * single pass over Products and the day's provider attempts, so Status reads and the history
 * admission job read one row instead of counting the catalog. `observed_at` is when the pass
 * counted; no row means nothing has been counted yet. History admission adds what it admits to the
 * `history_*` population between passes (see admitProductHistory).
 */
export const productStats = pgTable(
    'product_stats',
    {
        id: integer('id').primaryKey(),
        observedAt: timestamp('observed_at', { mode: 'date' }).notNull(),
        // The Product index: all Products, active Merch listings, Products created in the last day.
        products: integer('products').notNull(),
        merch: integer('merch').notNull(),
        new24h: integer('new_24h').notNull(),
        // Active Merch listings by sales-history status (see readProductStats).
        merchWithHistory: integer('merch_with_history').notNull(),
        merchAwaitingFirst: integer('merch_awaiting_first').notNull(),
        merchNotTracked: integer('merch_not_tracked').notNull(),
        // SP-API refresh tiers: Merch listings by BSR band, then non-Merch or BSR-less Products.
        spApiLt200k: integer('sp_api_lt_200k').notNull(),
        spApi200kTo500k: integer('sp_api_200k_to_500k').notNull(),
        spApi500kTo1m: integer('sp_api_500k_to_1m').notNull(),
        spApi1mTo3m: integer('sp_api_1m_to_3m').notNull(),
        spApiGte3m: integer('sp_api_gte_3m').notNull(),
        spApiNonAuto: integer('sp_api_non_auto').notNull(),
        // Standing history: admitted active Merch listings by Keepa cadence (BSR under 50k, under
        // 300k, under 1M), then the Products the automatic Keepa tiers leave out.
        historyTwiceDaily: integer('history_twice_daily').notNull(),
        historyDaily: integer('history_daily').notNull(),
        historyWeekly: integer('history_weekly').notNull(),
        keepaOnDemand: integer('keepa_on_demand').notNull(),
        keepaMerchMissingBsr: integer('keepa_merch_missing_bsr').notNull(),
        keepaNonMerch: integer('keepa_non_merch').notNull(),
        // Standing history past its refresh window at `observed_at`, and the oldest due time.
        historyOverdue: integer('history_overdue').notNull(),
        historyOldestOverdueAt: timestamp('history_oldest_overdue_at', { mode: 'date' }),
        providerCalls: jsonb('provider_calls').$type<ProviderCallCounts[]>().notNull(),
    },
    table => ({ singleton: check('product_stats_singleton', sql`${table.id} = 1`) })
);
