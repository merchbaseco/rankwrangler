import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const rankwranglerServiceAccounts = pgTable(
    'rankwrangler_service_accounts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        service: text('service').notNull().default('rankwrangler'),
        merchbaseUserId: text('merchbase_user_id'),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
        lastUsedAt: timestamp('last_used_at', { mode: 'date' }),
        usageToday: integer('usage_today').notNull().default(0),
        usageCount: integer('usage_count').notNull().default(0),
        usageLimit: integer('usage_limit').notNull().default(100_000),
        lastResetAt: timestamp('last_reset_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        serviceMerchbaseUserUniqueIdx: uniqueIndex(
            'rankwrangler_service_accounts_service_merchbase_user_unique'
        )
            .on(table.service, table.merchbaseUserId)
            .where(sql`${table.merchbaseUserId} is not null`),
        serviceCheck: check(
            'rankwrangler_service_accounts_service_check',
            sql`${table.service} = 'rankwrangler'`
        ),
        usageCheck: check(
            'rankwrangler_service_accounts_usage_check',
            sql`${table.usageToday} >= 0 and ${table.usageCount} >= 0 and (${table.usageLimit} = -1 or ${table.usageLimit} >= 0)`
        ),
    })
);
