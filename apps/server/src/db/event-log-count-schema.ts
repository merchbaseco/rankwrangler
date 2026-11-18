import { sql } from 'drizzle-orm';
import {
    check,
    integer,
    pgTable,
    primaryKey,
    smallint,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Event counts per time bucket and filterable dimension, folded from `event_logs` by the
 * `fold-event-log-counts` job so the Status histogram and its total read a few hundred rows
 * instead of aggregating a day or a week of events. Minute rows (`bucket_minutes` 1) serve the
 * hour range; half-hour rows (30) serve the day and week ranges, whose buckets are whole
 * half-hours. Rows are exact for events before `event_log_count_state.folded_through`.
 */
export const eventLogCounts = pgTable(
    'event_log_counts',
    {
        accountId: text('account_id').notNull(),
        bucketMinutes: smallint('bucket_minutes').notNull(),
        bucketStart: timestamp('bucket_start', { mode: 'date' }).notNull(),
        primitiveType: text('primitive_type').notNull(),
        level: text('level').notNull(),
        status: text('status').notNull(),
        count: integer('count').notNull(),
    },
    table => ({
        pk: primaryKey({
            name: 'event_log_counts_pk',
            columns: [
                table.accountId,
                table.bucketMinutes,
                table.bucketStart,
                table.primitiveType,
                table.level,
                table.status,
            ],
        }),
        bucketMinutesCheck: check(
            'event_log_counts_bucket_minutes_check',
            sql`${table.bucketMinutes} in (1, 30)`
        ),
    })
);

/**
 * How far the fold has counted: `event_log_counts` covers events before `folded_through`, and
 * readers count raw events from there on. No row means nothing is folded yet.
 */
export const eventLogCountState = pgTable(
    'event_log_count_state',
    {
        id: integer('id').primaryKey(),
        foldedThrough: timestamp('folded_through', { mode: 'date' }).notNull(),
    },
    table => ({ singleton: check('event_log_count_state_singleton', sql`${table.id} = 1`) })
);
