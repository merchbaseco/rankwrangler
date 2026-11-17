import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type {
    KeepaCapacityOperation,
    KeepaWorkClass,
} from '@/services/providers/keepa/keepa-capacity-types';

export const keepaCapacityState = pgTable(
    'keepa_capacity_state',
    {
        id: integer('id').primaryKey(),
        tokensLeft: integer('tokens_left').notNull(),
        refillRate: integer('refill_rate').notNull(),
        refillInMs: integer('refill_in_ms').notNull(),
        observedAt: timestamp('observed_at', { mode: 'date' }).notNull(),
        // Tokens background work leaves in the bucket for live requests; change it in place to tune.
        liveReserveTokens: integer('live_reserve_tokens').notNull().default(100),
    },
    table => ({ singleton: check('keepa_capacity_singleton', sql`${table.id} = 1`) })
);

export const keepaCapacityAttempts = pgTable(
    'keepa_capacity_attempts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        operation: text('operation').$type<KeepaCapacityOperation>().notNull(),
        workClass: text('work_class').$type<KeepaWorkClass>().notNull(),
        keywordId: uuid('keyword_id'),
        workId: text('work_id'),
        itemCount: integer('item_count').notNull().default(1),
        reservedTokens: integer('reserved_tokens'),
        actualTokens: integer('actual_tokens'),
        refillRate: integer('refill_rate'),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        reservedAt: timestamp('reserved_at', { mode: 'date' }),
        settledAt: timestamp('settled_at', { mode: 'date' }),
    },
    // Reservation reads stay index range scans: the last hour's open spend by `reserved_at`, the
    // day's pilot caps by class. A daily job deletes attempts over seven days old by `created_at`.
    table => ({
        recent: index('keepa_capacity_attempts_recent_idx').on(table.createdAt),
        reserved: index('keepa_capacity_attempts_reserved_idx').on(table.reservedAt),
        classReserved: index('keepa_capacity_attempts_class_reserved_idx').on(
            table.workClass,
            table.reservedAt
        ),
    })
);

/**
 * The measured per-item cost of each priced Keepa operation: the 95th percentile of the last
 * `KEEPA_MEASURED_COST_WINDOW` settled calls that reported spend, kept in `recent_costs` (oldest
 * first) and recomputed in the settlement transaction, so reservations read one row.
 */
export const keepaMeasuredCosts = pgTable(
    'keepa_measured_costs',
    {
        operation: text('operation').$type<'product' | 'search'>().primaryKey(),
        recentCosts: integer('recent_costs').array().notNull(),
        cost: integer('cost').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
    },
    table => ({
        operationCheck: check(
            'keepa_measured_costs_operation_check',
            sql`${table.operation} in ('product', 'search')`
        ),
    })
);
