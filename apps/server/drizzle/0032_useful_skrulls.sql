ALTER TABLE "products" ALTER COLUMN "is_merch_listing" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "is_merch_listing" DROP NOT NULL;