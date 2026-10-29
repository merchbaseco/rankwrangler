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
        reservedTokens: integer('reserved_tokens'),
        actualTokens: integer('actual_tokens'),
        refillRate: integer('refill_rate'),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        reservedAt: timestamp('reserved_at', { mode: 'date' }),
        settledAt: timestamp('settled_at', { mode: 'date' }),
    },
    table => ({
        recent: index('keepa_capacity_attempts_recent_idx').on(table.createdAt),
        keyword: index('keepa_capacity_attempts_keyword_idx').on(table.keywordId, table.createdAt),
    })
);
