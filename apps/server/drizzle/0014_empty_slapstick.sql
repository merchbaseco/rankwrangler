CREATE TABLE "keepa_history_refresh_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "keepa_history_refresh_queue_marketplace_asin_idx" ON "keepa_history_refresh_queue" USING btree ("marketplace_id","asin");--> statement-breakpoint
CREATE INDEX "keepa_history_refresh_queue_next_attempt_created_idx" ON "keepa_history_refresh_queue" USING btree ("next_attempt_at","created_at");