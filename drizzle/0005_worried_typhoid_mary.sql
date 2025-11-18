CREATE TABLE "display_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"link" text
);
--> statement-breakpoint
CREATE TABLE "product_rank_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"display_group_id" uuid NOT NULL,
	"date" date NOT NULL,
	"bsr" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"creation_date" timestamp,
	"thumbnail_url" text,
	"last_fetched" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
DROP TABLE "product_cache" CASCADE;--> statement-breakpoint
DROP TABLE "system_stats" CASCADE;--> statement-breakpoint
ALTER TABLE "product_rank_history" ADD CONSTRAINT "product_rank_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_rank_history" ADD CONSTRAINT "product_rank_history_display_group_id_display_groups_id_fk" FOREIGN KEY ("display_group_id") REFERENCES "public"."display_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "display_groups_category_link_idx" ON "display_groups" USING btree ("category","link");--> statement-breakpoint
CREATE UNIQUE INDEX "product_rank_history_product_display_group_date_idx" ON "product_rank_history" USING btree ("product_id","display_group_id","date");--> statement-breakpoint
CREATE INDEX "product_rank_history_product_id_idx" ON "product_rank_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_rank_history_date_idx" ON "product_rank_history" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "products_marketplace_asin_idx" ON "products" USING btree ("marketplace_id","asin");--> statement-breakpoint
CREATE INDEX "products_expires_at_idx" ON "products" USING btree ("expires_at");