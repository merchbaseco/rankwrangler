CREATE TABLE "search_terms_fetch_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"report_period" text NOT NULL,
	"data_start_date" text NOT NULL,
	"data_end_date" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"active_job_id" text,
	"active_job_requested_at" timestamp,
	"fetch_started_at" timestamp,
	"last_completed_at" timestamp,
	"last_failed_at" timestamp,
	"last_error" text,
	"last_completed_snapshot_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_terms_keyword_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"marketplace_id" text NOT NULL,
	"report_period" text NOT NULL,
	"data_start_date" text NOT NULL,
	"data_end_date" text NOT NULL,
	"observed_date" text NOT NULL,
	"search_term" text NOT NULL,
	"search_frequency_rank" integer NOT NULL,
	"click_share_top3_sum_basis_points" integer NOT NULL,
	"conversion_share_top3_sum_basis_points" integer NOT NULL,
	"top_rows_count" integer DEFAULT 1 NOT NULL,
	"is_merch_relevant" boolean DEFAULT true NOT NULL,
	"merch_reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_terms_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"report_period" text NOT NULL,
	"data_start_date" text NOT NULL,
	"data_end_date" text NOT NULL,
	"observed_date" text NOT NULL,
	"report_id" text NOT NULL,
	"source_job_id" text NOT NULL,
	"keyword_count" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_terms_fetch_status" ADD CONSTRAINT "search_terms_fetch_status_last_completed_snapshot_id_search_terms_snapshots_id_fk" FOREIGN KEY ("last_completed_snapshot_id") REFERENCES "public"."search_terms_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_terms_keyword_daily" ADD CONSTRAINT "search_terms_keyword_daily_snapshot_id_search_terms_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."search_terms_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_terms_fetch_status_window_idx" ON "search_terms_fetch_status" USING btree ("marketplace_id","report_period","data_start_date","data_end_date");--> statement-breakpoint
CREATE INDEX "search_terms_fetch_status_status_updated_idx" ON "search_terms_fetch_status" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "search_terms_keyword_daily_snapshot_term_idx" ON "search_terms_keyword_daily" USING btree ("snapshot_id","search_term");--> statement-breakpoint
CREATE INDEX "search_terms_keyword_daily_snapshot_rank_idx" ON "search_terms_keyword_daily" USING btree ("snapshot_id","search_frequency_rank","search_term");--> statement-breakpoint
CREATE INDEX "search_terms_keyword_daily_window_observed_rank_idx" ON "search_terms_keyword_daily" USING btree ("marketplace_id","report_period","data_start_date","data_end_date","observed_date","search_frequency_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "search_terms_snapshots_window_observed_idx" ON "search_terms_snapshots" USING btree ("marketplace_id","report_period","data_start_date","data_end_date","observed_date");--> statement-breakpoint
CREATE INDEX "search_terms_snapshots_window_fetched_idx" ON "search_terms_snapshots" USING btree ("marketplace_id","report_period","data_start_date","data_end_date","fetched_at");