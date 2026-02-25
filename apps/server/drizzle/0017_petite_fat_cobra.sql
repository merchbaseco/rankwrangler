CREATE TABLE "event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text DEFAULT 'global' NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"status" text NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"primitive_type" text NOT NULL,
	"message" text NOT NULL,
	"details_json" jsonb NOT NULL,
	"primitive_id" text,
	"marketplace_id" text,
	"asin" text,
	"job_name" text,
	"job_run_id" text,
	"request_id" text
);
--> statement-breakpoint
CREATE INDEX "event_logs_account_occurred_at_idx" ON "event_logs" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "event_logs_account_primitive_occurred_at_idx" ON "event_logs" USING btree ("account_id","primitive_type","occurred_at");--> statement-breakpoint
CREATE INDEX "event_logs_account_asin_occurred_at_idx" ON "event_logs" USING btree ("account_id","asin","occurred_at");--> statement-breakpoint
CREATE INDEX "event_logs_account_job_run_occurred_at_idx" ON "event_logs" USING btree ("account_id","job_run_id","occurred_at");