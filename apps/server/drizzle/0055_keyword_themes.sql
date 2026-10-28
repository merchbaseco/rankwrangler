CREATE TABLE "keyword_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"theme" text NOT NULL,
	"first_query_id" uuid,
	"stage" text DEFAULT 'pending' NOT NULL,
	"suggestions" jsonb,
	"trial_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"claim_token" uuid,
	"claim_at" timestamp,
	"next_due_at" timestamp DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_themes_claim_check" CHECK (("keyword_themes"."claim_token" is null)=("keyword_themes"."claim_at" is null))
);
--> statement-breakpoint
ALTER TABLE "brand_analytics_search_terms" DROP CONSTRAINT "brand_analytics_search_terms_rank_check";--> statement-breakpoint
DROP INDEX "brand_analytics_search_terms_unregistered_idx";--> statement-breakpoint
ALTER TABLE "brand_analytics_search_terms" ADD COLUMN "merch_product_text" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_analytics_search_terms" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "keyword_themes" ADD CONSTRAINT "keyword_themes_first_query_id_catalog_queries_id_fk" FOREIGN KEY ("first_query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_themes_theme_idx" ON "keyword_themes" USING btree ("marketplace_id","theme");--> statement-breakpoint
CREATE INDEX "keyword_themes_due_idx" ON "keyword_themes" USING btree ("next_due_at") WHERE "keyword_themes"."stage"<>'complete';--> statement-breakpoint
CREATE INDEX "brand_analytics_search_terms_theme_idx" ON "brand_analytics_search_terms" USING btree ("theme") WHERE "brand_analytics_search_terms"."registered_at" is null and "brand_analytics_search_terms"."apparel_clicks" = 0;--> statement-breakpoint
CREATE INDEX "brand_analytics_search_terms_unregistered_idx" ON "brand_analytics_search_terms" USING btree ("search_frequency_rank") WHERE "brand_analytics_search_terms"."registered_at" is null and "brand_analytics_search_terms"."apparel_clicks" >= 1;--> statement-breakpoint
ALTER TABLE "brand_analytics_search_terms" ADD CONSTRAINT "brand_analytics_search_terms_rank_check" CHECK ("brand_analytics_search_terms"."search_frequency_rank" > 0 and "brand_analytics_search_terms"."apparel_clicks" between 0 and 3 and ("brand_analytics_search_terms"."apparel_clicks" >= 1 or "brand_analytics_search_terms"."merch_product_text"));