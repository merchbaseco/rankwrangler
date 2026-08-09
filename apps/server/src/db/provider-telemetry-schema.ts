import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

export const providerAttempts = pgTable(
    'provider_attempts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        provider: text('provider').notNull(),
        operation: text('operation').notNull(),
        attemptedAt: timestamp('attempted_at', { mode: 'date' }).notNull(),
        statusCode: integer('status_code'),
        isError: boolean('is_error').notNull(),
        latencyMs: integer('latency_ms').notNull(),
    },
    table => ({
        attemptedAtIdx: index('provider_attempts_attempted_at_idx').on(table.attemptedAt),
        providerOperationAttemptedAtIdx: index(
            'provider_attempts_provider_operation_attempted_at_idx'
        ).on(table.provider, table.operation, table.attemptedAt),
        latencyCheck: check('provider_attempts_latency_check', sql`${table.latencyMs} >= 0`),
        statusCodeCheck: check(
            'provider_attempts_status_code_check',
            sql`${table.statusCode} IS NULL OR ${table.statusCode} BETWEEN 100 AND 599`
        ),
    })
);
