CREATE TABLE "brand_analytics_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"week_start" text NOT NULL,
	"week_end" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"report_id" text,
	"report_document_id" text,
	"report_status" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claim_token" uuid,
	"claim_at" timestamp,
	"rows" integer,
	"terms" integer,
	"kept_terms" integer,
	"new_terms" integer,
	"requested_at" timestamp,
	"imported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_analytics_imports_claim_check" CHECK (("brand_analytics_imports"."claim_token" is null)=("brand_analytics_imports"."claim_at" is null))
);
--> statement-breakpoint
CREATE TABLE "brand_analytics_search_terms" (
	"marketplace_id" text NOT NULL,
	"normalized_term" text NOT NULL,
	"search_frequency_rank" integer NOT NULL,
	"apparel_clicks" integer NOT NULL,
	"clicked_asins" jsonb NOT NULL,
	"first_seen_week" text NOT NULL,
	"last_seen_week" text NOT NULL,
	"registered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_analytics_search_terms_marketplace_id_normalized_term_pk" PRIMARY KEY("marketplace_id","normalized_term"),
	CONSTRAINT "brand_analytics_search_terms_rank_check" CHECK ("brand_analytics_search_terms"."search_frequency_rank" > 0 and "brand_analytics_search_terms"."apparel_clicks" between 1 and 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "brand_analytics_imports_week_idx" ON "brand_analytics_imports" USING btree ("marketplace_id","week_start");--> statement-breakpoint
CREATE INDEX "brand_analytics_search_terms_unregistered_idx" ON "brand_analytics_search_terms" USING btree ("search_frequency_rank") WHERE "brand_analytics_search_terms"."registered_at" is null;