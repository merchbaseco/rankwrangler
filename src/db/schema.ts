import { pgTable, uuid, text, json, timestamp, integer, date, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Define the metadata type to match the Sequelize model
export type LicenseMetadata = {
  features: string[];
  limits: { requests_per_day: number };
  notes?: string;
};

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  email: text('email').notNull(),
  metadata: json('metadata').$type<LicenseMetadata>().notNull().default({
    features: [],
    limits: { requests_per_day: 100000 }
  }),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  revokedAt: timestamp('revokedAt', { mode: 'date' }),
  lastUsedAt: timestamp('lastUsedAt', { mode: 'date' }),
  usageCount: integer('usageCount').notNull().default(0),
  usageToday: integer('usageToday').notNull().default(0),
  lastResetAt: timestamp('lastResetAt', { mode: 'date' }).notNull().defaultNow()
}, (table) => ({
  // Indexes to match Sequelize model
  keyIdx: uniqueIndex('licenses_key_unique').on(table.key),
  emailIdx: index('licenses_email_idx').on(table.email),
  revokedIdx: index('licenses_revoked_at_idx').on(table.revokedAt)
}));

// Export types for use in services
export type License = InferSelectModel<typeof licenses>;
export type NewLicense = InferInsertModel<typeof licenses>;

// Export attributes interface for compatibility with existing code
export interface LicenseAttributes {
  id: string;
  key: string;
  email: string;
  metadata: LicenseMetadata;
  createdAt: Date;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  usageCount: number;
  usageToday: number;
  lastResetAt: Date;
}

// Products table - local product store populated from SP-API
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  marketplaceId: text('marketplace_id').notNull(),
  asin: text('asin').notNull(),
  creationDate: timestamp('creation_date', { mode: 'date' }),
  thumbnailUrl: text('thumbnail_url'),
  lastFetched: timestamp('last_fetched', { mode: 'date' }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
}, (table) => ({
  // Composite unique index for marketplace + asin
  marketplaceAsinIdx: uniqueIndex('products_marketplace_asin_idx')
    .on(table.marketplaceId, table.asin),
  // Index for cleanup of expired entries
  expiresAtIdx: index('products_expires_at_idx').on(table.expiresAt)
}));

// Display groups table - stores display group categories and links
export const displayGroups = pgTable('display_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: text('category').notNull(),
  link: text('link'),
}, (table) => ({
  // Unique index to prevent duplicate display groups
  categoryLinkIdx: uniqueIndex('display_groups_category_link_idx')
    .on(table.category, table.link)
}));

// Product rank history table - tracks BSR over time per product/display group
export const productRankHistory = pgTable('product_rank_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  displayGroupId: uuid('display_group_id').notNull().references(() => displayGroups.id),
  date: date('date').notNull(),
  bsr: integer('bsr').notNull(),
}, (table) => ({
  // Unique index - one rank per product/display_group/date
  productDisplayGroupDateIdx: uniqueIndex('product_rank_history_product_display_group_date_idx')
    .on(table.productId, table.displayGroupId, table.date),
  // Indexes for queries
  productIdIdx: index('product_rank_history_product_id_idx').on(table.productId),
  dateIdx: index('product_rank_history_date_idx').on(table.date)
}));

// Product request queue table
export const productRequestQueue = pgTable('product_request_queue', {
    id: uuid('id').primaryKey().defaultRandom(),
    marketplaceId: text('marketplace_id').notNull(),
    asin: text('asin').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
    marketplaceAsinIdx: uniqueIndex('product_request_queue_marketplace_asin_idx')
        .on(table.marketplaceId, table.asin),
    createdAtIdx: index('product_request_queue_created_at_idx').on(table.createdAt),
}));

// Export types for tables
export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;
export type DisplayGroup = InferSelectModel<typeof displayGroups>;
export type NewDisplayGroup = InferInsertModel<typeof displayGroups>;
export type ProductRankHistory = InferSelectModel<typeof productRankHistory>;
export type NewProductRankHistory = InferInsertModel<typeof productRankHistory>;
export type ProductRequestQueue = InferSelectModel<typeof productRequestQueue>;
export type NewProductRequestQueue = InferInsertModel<typeof productRequestQueue>;
