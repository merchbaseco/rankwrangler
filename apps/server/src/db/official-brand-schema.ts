import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const officialBrands = pgTable(
    'official_brands',
    {
        marketplaceId: text('marketplace_id').notNull(),
        normalizedBrand: text('normalized_brand').notNull(),
        displayBrand: text('display_brand').notNull(),
        evidenceUrl: text('evidence_url').notNull(),
        verifiedAt: timestamp('verified_at', { mode: 'date' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        pk: primaryKey({ columns: [table.marketplaceId, table.normalizedBrand] }),
        normalizedBrandCheck: check(
            'official_brands_normalized_brand_check',
            sql`${table.normalizedBrand} <> '' AND ${table.normalizedBrand} =
                lower(btrim(regexp_replace(${table.normalizedBrand}, '[[:space:]]+', ' ', 'g')))`
        ),
        evidenceUrlCheck: check(
            'official_brands_evidence_url_check',
            sql`${table.evidenceUrl} ~ '^https?://[^[:space:]]+$'`
        ),
    })
);
