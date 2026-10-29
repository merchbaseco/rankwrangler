CREATE TABLE "keyword_prefixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"prefix" text NOT NULL,
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
	CONSTRAINT "keyword_prefixes_claim_check" CHECK (("keyword_prefixes"."claim_token" is null)=("keyword_prefixes"."claim_at" is null))
);
--> statement-breakpoint
ALTER TABLE "brand_analytics_search_terms" ADD COLUMN "prefix" text;--> statement-breakpoint
ALTER TABLE "keyword_prefixes" ADD CONSTRAINT "keyword_prefixes_first_query_id_catalog_queries_id_fk" FOREIGN KEY ("first_query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_prefixes_prefix_idx" ON "keyword_prefixes" USING btree ("marketplace_id","prefix");--> statement-breakpoint
CREATE INDEX "keyword_prefixes_due_idx" ON "keyword_prefixes" USING btree ("next_due_at") WHERE "keyword_prefixes"."stage"<>'complete';--> statement-breakpoint
CREATE INDEX "brand_analytics_search_terms_prefix_idx" ON "brand_analytics_search_terms" USING btree ("prefix") WHERE "brand_analytics_search_terms"."registered_at" is null and "brand_analytics_search_terms"."apparel_clicks" = 0;