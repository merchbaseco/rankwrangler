import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const accessDelegationAudit = pgTable('access_delegation_audit', {
    id: uuid('id').primaryKey().defaultRandom(),
    caller: text('caller').notNull(),
    receiver: text('receiver').notNull(),
    merchbaseUserId: text('merchbase_user_id').notNull(),
    route: text('route').notNull(),
    outcome: text('outcome').notNull(),
    receivedAt: timestamp('received_at', { mode: 'date', withTimezone: true })
        .notNull()
        .defaultNow(),
});
