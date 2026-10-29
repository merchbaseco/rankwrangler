import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const historyAdmissionRollouts = pgTable(
    'history_admission_rollouts',
    {
        key: text('key').primaryKey(),
        baselineAt: timestamp('baseline_at', { mode: 'date' }).notNull(),
        baselineProducts: integer('baseline_products').notNull(),
    },
    table => ({
        countCheck: check(
            'history_admission_rollouts_count_check',
            sql`${table.baselineProducts} >= 0`
        ),
    })
);
