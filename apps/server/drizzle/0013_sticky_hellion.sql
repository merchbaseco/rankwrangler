CREATE TABLE "keepa_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"category_id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "keepa_categories_marketplace_category_idx" ON "keepa_categories" USING btree ("marketplace_id","category_id");--> statement-breakpoint
CREATE INDEX "keepa_categories_marketplace_name_idx" ON "keepa_categories" USING btree ("marketplace_id","name");