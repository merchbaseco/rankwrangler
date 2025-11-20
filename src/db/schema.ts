import {
    bigint,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

export const licenses = pgTable(
    'licenses',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        key: text('key').notNull(),
        email: text('email').notNull(),
        createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
        revokedAt: timestamp('revokedAt', { mode: 'date' }),
        lastUsedAt: timestamp('lastUsedAt', { mode: 'date' }),
        usageToday: integer('usageToday').notNull().default(0),
        usageCount: integer('usageCount').notNull().default(0),
        usageLimit: integer('usageLimit').notNull().default(100000),
        lastResetAt: timestamp('lastResetAt', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        keyIdx: uniqueIndex('licenses_key_unique').on(table.key),
        emailIdx: index('licenses_email_idx').on(table.email),
        revokedIdx: index('licenses_revoked_at_idx').on(table.revokedAt),
    })
);

// Products table - local product store populated from SP-API
export const products = pgTable(
    'products',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        dateFirstAvailable: timestamp('date_first_available', { mode: 'date' }),
        thumbnailUrl: text('thumbnail_url'),
        rootCategoryId: bigint('root_category_id', { mode: 'number' }),
        rootCategoryBsr: integer('root_category_bsr'),
        lastFetched: timestamp('last_fetched', { mode: 'date' }).notNull().defaultNow(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        // Composite unique index for marketplace + asin
        marketplaceAsinIdx: uniqueIndex('products_marketplace_asin_idx').on(
            table.marketplaceId,
            table.asin
        ),
    })
);

// Product ingest queue table
export const productIngestQueue = pgTable(
    'product_ingest_queue',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        marketplaceId: text('marketplace_id').notNull(),
        asin: text('asin').notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        marketplaceAsinIdx: uniqueIndex('product_ingest_queue_marketplace_asin_idx').on(
            table.marketplaceId,
            table.asin
        ),
        createdAtIdx: index('product_ingest_queue_created_at_idx').on(table.createdAt),
    })
);
