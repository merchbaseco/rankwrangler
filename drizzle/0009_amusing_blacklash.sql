DROP TABLE "display_groups" CASCADE;--> statement-breakpoint
DROP TABLE "product_rank_history" CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "root_category_id" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "root_category_bsr" integer;