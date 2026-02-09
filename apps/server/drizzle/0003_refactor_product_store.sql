-- Drop old product_cache table and its indexes
DROP INDEX IF EXISTS "product_cache_expires_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "product_cache_marketplace_asin_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "product_cache";--> statement-breakpoint

-- Create products table (replaces product_cache)
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"creation_date" timestamp,
	"last_fetched" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint

-- Create display_groups table
CREATE TABLE "display_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"link" text
);
--> statement-breakpoint

-- Create product_rank_history table
CREATE TABLE "product_rank_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"display_group_id" uuid NOT NULL,
	"date" date NOT NULL,
	"bsr" integer NOT NULL
);
--> statement-breakpoint

-- Create indexes for products table
CREATE UNIQUE INDEX "products_marketplace_asin_idx" ON "products" USING btree ("marketplace_id","asin");--> statement-breakpoint
CREATE INDEX "products_expires_at_idx" ON "products" USING btree ("expires_at");--> statement-breakpoint

-- Create indexes for display_groups table
CREATE UNIQUE INDEX "display_groups_category_link_idx" ON "display_groups" USING btree ("category","link");--> statement-breakpoint

-- Create indexes for product_rank_history table
CREATE UNIQUE INDEX "product_rank_history_product_display_group_date_idx" ON "product_rank_history" USING btree ("product_id","display_group_id","date");--> statement-breakpoint
CREATE INDEX "product_rank_history_product_id_idx" ON "product_rank_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_rank_history_date_idx" ON "product_rank_history" USING btree ("date");--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "product_rank_history" ADD CONSTRAINT "product_rank_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_rank_history" ADD CONSTRAINT "product_rank_history_display_group_id_display_groups_id_fk" FOREIGN KEY ("display_group_id") REFERENCES "display_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Rename products_in_cache to products_in_store in system_stats
ALTER TABLE "system_stats" RENAME COLUMN "products_in_cache" TO "products_in_store";

