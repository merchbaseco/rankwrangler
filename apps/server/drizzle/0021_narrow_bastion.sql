ALTER TABLE "products" RENAME COLUMN "last_fetched" TO "sp_api_fetched_at";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sp_api_fetched_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sp_api_fetched_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_source_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_first_tracked_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_root_category_id" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_current_bsr" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_current_new_price" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_monthly_sold" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_bsr_average_30" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_bsr_average_90" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_sales_rank_drops_30" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_sales_rank_drops_90" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_sales_rank_drops_180" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "keepa_sales_rank_drops_365" integer;--> statement-breakpoint
CREATE INDEX "products_keepa_refresh_candidate_idx" ON "products" USING btree ("is_merch_listing","root_category_bsr","keepa_fetched_at");
