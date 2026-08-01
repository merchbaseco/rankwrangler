import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const rankwranglerCutoverGate = pgTable(
    'rankwrangler_cutover_gate',
    {
        id: text('id').primaryKey(),
        legacyLicenseId: uuid('legacy_license_id').notNull(),
        serviceAccountId: uuid('service_account_id').notNull(),
        state: text('state').notNull().default('pending'),
        planDigest: text('plan_digest'),
        backupFingerprint: text('backup_fingerprint'),
        preservationProof: text('preservation_proof'),
        approvedBy: text('approved_by'),
        approvedAt: timestamp('approved_at', { mode: 'date' }),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        legacyLicenseUniqueIdx: uniqueIndex('rankwrangler_cutover_gate_legacy_license_unique').on(
            table.legacyLicenseId
        ),
        serviceAccountUniqueIdx: uniqueIndex('rankwrangler_cutover_gate_service_account_unique').on(
            table.serviceAccountId
        ),
        stateCheck: check(
            'rankwrangler_cutover_gate_state_check',
            sql`${table.state} in ('pending', 'approved', 'consumed')`
        ),
    })
);
