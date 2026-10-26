import { sql } from 'drizzle-orm';
import { bigint, check, doublePrecision, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';

export const spApiCatalogCapacity = pgTable(
    'spapi_catalog_capacity',
    {
        discoveryClaims: integer('discovery_claims').notNull().default(0),
        id: integer('id').primaryKey(),
        effectiveRps: doublePrecision('effective_rps').notNull().default(1),
        observedRate: doublePrecision('observed_rate'),
        observedAt: timestamp('observed_at', { mode: 'date' }),
        tokens: doublePrecision('tokens').notNull().default(0),
        backgroundTokens: doublePrecision('background_tokens').notNull().default(0),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
        backgroundPausedUntil: timestamp('background_paused_until', { mode: 'date' }),
        cooldownUntil: timestamp('cooldown_until', { mode: 'date' }),
        lastThrottleAt: timestamp('last_throttle_at', { mode: 'date' }),
        foregroundStarts: bigint('foreground_starts', { mode: 'number' }).notNull().default(0),
        backgroundStarts: bigint('background_starts', { mode: 'number' }).notNull().default(0),
    },
    table => ({ singleton: check('spapi_catalog_capacity_singleton', sql`${table.id}=1`) })
);
