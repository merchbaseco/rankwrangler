import { boolean, integer, pgTable, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const automaticSyncControl = pgTable(
    'automatic_sync_control',
    {
        id: integer('id').primaryKey().default(1),
        paused: boolean('paused').notNull().default(true),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
        updatedBy: text('updated_by'),
    },
    table => ({ singleton: check('automatic_sync_singleton', sql`${table.id}=1`) })
);
