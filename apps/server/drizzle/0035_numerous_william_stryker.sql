ALTER TABLE "products" RENAME COLUMN "is_unavailable" TO "amazon_listing_status";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "amazon_listing_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "amazon_listing_status" TYPE text USING (
    CASE
        WHEN "amazon_listing_status" THEN 'deleted'
        ELSE 'active'
    END
);--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "amazon_listing_status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_amazon_listing_status_check" CHECK ("products"."amazon_listing_status" in ('active', 'deleted'));
