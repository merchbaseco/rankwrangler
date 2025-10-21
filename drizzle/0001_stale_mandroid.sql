CREATE TABLE "product_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"data" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"products_in_cache" integer DEFAULT 0 NOT NULL,
	"total_sp_api_calls" integer DEFAULT 0 NOT NULL,
	"total_cache_hits" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_cache_marketplace_asin_idx" ON "product_cache" USING btree ("marketplace_id","asin");--> statement-breakpoint
CREATE INDEX "product_cache_expires_at_idx" ON "product_cache" USING btree ("expires_at");