import { pgTable, uuid, text, json, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { ProductInfo } from '@/types/index.js';

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
    limits: { requests_per_day: 1000 }
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

// Product cache table for persistent caching
export const productCache = pgTable('product_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  marketplaceId: text('marketplace_id').notNull(),
  asin: text('asin').notNull(),
  data: json('data').$type<ProductInfo>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  lastAccessedAt: timestamp('last_accessed_at', { mode: 'date' }).notNull().defaultNow(),
  accessCount: integer('access_count').notNull().default(0)
}, (table) => ({
  // Composite unique index for marketplace + asin
  marketplaceAsinIdx: uniqueIndex('product_cache_marketplace_asin_idx')
    .on(table.marketplaceId, table.asin),
  // Index for cleanup of expired entries
  expiresAtIdx: index('product_cache_expires_at_idx').on(table.expiresAt)
}));

// System stats table with efficient single-row counter design
export const systemStats = pgTable('system_stats', {
  id: text('id').primaryKey(), // 'current' for live stats
  productsInCache: integer('products_in_cache').notNull().default(0),
  totalSpApiCalls: integer('total_sp_api_calls').notNull().default(0),
  totalCacheHits: integer('total_cache_hits').notNull().default(0),
  lastResetAt: timestamp('last_reset_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow()
});

// Export types for new tables
export type ProductCache = InferSelectModel<typeof productCache>;
export type NewProductCache = InferInsertModel<typeof productCache>;
export type SystemStats = InferSelectModel<typeof systemStats>;
export type NewSystemStats = InferInsertModel<typeof systemStats>;