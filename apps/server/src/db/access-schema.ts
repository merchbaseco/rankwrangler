import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

export const accessProjection = pgTable(
    'access_projection',
    {
        issuer: text('issuer').notNull(),
        subject: text('subject').notNull(),
        state: text('state').notNull(),
        merchbaseUserId: text('merchbase_user_id'),
        access: text('access'),
        accessValidUntil: bigint('access_valid_until', { mode: 'number' }),
        sourceUpdatedAt: bigint('source_updated_at', { mode: 'number' }).notNull(),
        lastEventId: text('last_event_id').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        identityPk: primaryKey({
            columns: [table.issuer, table.subject],
            name: 'access_projection_identity_pk',
        }),
        mappedUserUniqueIdx: uniqueIndex('access_projection_merchbase_user_unique')
            .on(table.merchbaseUserId)
            .where(sql`${table.state} = 'active' and ${table.merchbaseUserId} is not null`),
        stateCheck: check(
            'access_projection_state_check',
            sql`${table.state} in ('active', 'tombstone')`
        ),
        accessCheck: check(
            'access_projection_access_check',
            sql`${table.access} is null or ${table.access} in ('granted', 'not_granted')`
        ),
    })
);

export const accessProjectionEvents = pgTable(
    'access_projection_event',
    {
        eventId: text('event_id').primaryKey(),
        issuer: text('issuer').notNull(),
        subject: text('subject').notNull(),
        sourceUpdatedAt: bigint('source_updated_at', { mode: 'number' }).notNull(),
        receivedAt: timestamp('received_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        identityIdx: index('access_projection_event_identity_idx').on(
            table.issuer,
            table.subject,
            table.sourceUpdatedAt
        ),
    })
);
