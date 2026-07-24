ALTER TABLE "catalog_queries" ADD COLUMN "tracked_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "next_tracking_attempt_at" timestamp;--> statement-breakpoint
CREATE INDEX "catalog_queries_tracked_due_idx" ON "catalog_queries" USING btree ("tracked_at","next_tracking_attempt_at","latest_successful_run_at");