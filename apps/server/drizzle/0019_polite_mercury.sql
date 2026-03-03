CREATE TABLE "top_search_terms_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"report_period" text NOT NULL,
	"data_start_date" text NOT NULL,
	"data_end_date" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"refreshing" boolean DEFAULT false NOT NULL,
	"active_job_id" text,
	"active_job_requested_at" timestamp,
	"fetch_started_at" timestamp,
	"last_completed_at" timestamp,
	"last_failed_at" timestamp,
	"last_error" text,
	"report_id" text,
	"next_refresh_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "top_search_terms_keyword_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
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
CREATE TABLE "top_search_terms_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
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
DROP TABLE "search_terms_fetch_status" CASCADE;--> statement-breakpoint
DROP TABLE "search_terms_keyword_daily" CASCADE;--> statement-breakpoint
DROP TABLE "search_terms_snapshots" CASCADE;--> statement-breakpoint
ALTER TABLE "top_search_terms_keyword_daily" ADD CONSTRAINT "top_search_terms_keyword_daily_snapshot_id_top_search_terms_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."top_search_terms_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_search_terms_keyword_daily" ADD CONSTRAINT "top_search_terms_keyword_daily_dataset_id_top_search_terms_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."top_search_terms_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_search_terms_snapshots" ADD CONSTRAINT "top_search_terms_snapshots_dataset_id_top_search_terms_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."top_search_terms_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "top_search_terms_datasets_window_idx" ON "top_search_terms_datasets" USING btree ("marketplace_id","report_period","data_start_date","data_end_date");--> statement-breakpoint
CREATE INDEX "top_search_terms_datasets_due_idx" ON "top_search_terms_datasets" USING btree ("marketplace_id","report_period","next_refresh_at");--> statement-breakpoint
CREATE INDEX "top_search_terms_datasets_status_updated_idx" ON "top_search_terms_datasets" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "top_search_terms_keyword_daily_snapshot_term_idx" ON "top_search_terms_keyword_daily" USING btree ("snapshot_id","search_term");--> statement-breakpoint
CREATE INDEX "top_search_terms_keyword_daily_snapshot_rank_idx" ON "top_search_terms_keyword_daily" USING btree ("snapshot_id","search_frequency_rank","search_term");--> statement-breakpoint
CREATE INDEX "top_search_terms_keyword_daily_dataset_rank_idx" ON "top_search_terms_keyword_daily" USING btree ("dataset_id","search_frequency_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "top_search_terms_snapshots_dataset_observed_idx" ON "top_search_terms_snapshots" USING btree ("dataset_id","observed_date");--> statement-breakpoint
CREATE INDEX "top_search_terms_snapshots_dataset_fetched_idx" ON "top_search_terms_snapshots" USING btree ("dataset_id","fetched_at");