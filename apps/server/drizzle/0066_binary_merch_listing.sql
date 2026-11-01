UPDATE "products" SET "is_merch_listing" = false WHERE "is_merch_listing" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "is_merch_listing" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "is_merch_listing" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" DROP COLUMN "unknown_products";