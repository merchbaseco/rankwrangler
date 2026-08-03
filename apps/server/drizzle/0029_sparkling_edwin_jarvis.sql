ALTER TABLE "catalog_queries" RENAME COLUMN "tracked_at" TO "last_requested_at";--> statement-breakpoint
ALTER TABLE "catalog_queries" RENAME COLUMN "next_tracking_attempt_at" TO "next_refresh_attempt_at";--> statement-breakpoint
DROP INDEX "catalog_queries_tracked_due_idx";--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "active_until" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "last_refresh_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_search_runs" ADD COLUMN "trigger" text;--> statement-breakpoint
WITH "latest_requested" AS (
    SELECT
        "run"."query_id",
        max("run"."source_completed_at") AS "requested_at"
    FROM "catalog_search_runs" AS "run"
    INNER JOIN "operations" AS "operation" ON "operation"."id" = "run"."operation_id"
    WHERE coalesce("operation"."input"->>'priority', 'interactive') <> 'scheduled'
    GROUP BY "run"."query_id"
)
UPDATE "catalog_queries" AS "query"
SET "last_requested_at" = CASE
    WHEN "query"."last_requested_at" IS NULL THEN "latest_requested"."requested_at"
    ELSE greatest("query"."last_requested_at", "latest_requested"."requested_at")
END
FROM "latest_requested"
WHERE "query"."id" = "latest_requested"."query_id";--> statement-breakpoint
UPDATE "catalog_queries"
SET "active_until" = "last_requested_at" + interval '30 days'
WHERE "last_requested_at" IS NOT NULL;--> statement-breakpoint
UPDATE "catalog_search_runs" AS "run"
SET "trigger" = CASE
    WHEN "operation"."input"->>'priority' = 'scheduled' THEN 'automatic'
    ELSE 'requested'
END
FROM "operations" AS "operation"
WHERE "operation"."id" = "run"."operation_id";--> statement-breakpoint
ALTER TABLE "catalog_search_runs" ALTER COLUMN "trigger" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "catalog_queries_active_refresh_due_idx" ON "catalog_queries" USING btree ("active_until","next_refresh_attempt_at","latest_successful_run_at");--> statement-breakpoint
CREATE INDEX "operations_catalog_search_target_updated_idx" ON "operations" USING btree ("target_key","updated_at","id") WHERE "operations"."type" = 'catalogSearch';--> statement-breakpoint
ALTER TABLE "catalog_search_runs" ADD CONSTRAINT "catalog_search_runs_trigger_check" CHECK ("catalog_search_runs"."trigger" in ('requested', 'automatic'));
