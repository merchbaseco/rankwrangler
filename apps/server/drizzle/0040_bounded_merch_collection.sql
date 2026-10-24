-- Freeze Product identities until the baseline receipt and admission transition commit.
LOCK TABLE "products" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "history_admission_rollouts" (
	"key" text PRIMARY KEY NOT NULL,
	"baseline_at" timestamp NOT NULL,
	"baseline_products" integer NOT NULL,
	CONSTRAINT "history_admission_rollouts_count_check" CHECK ("history_admission_rollouts"."baseline_products" >= 0)
);
--> statement-breakpoint
CREATE TABLE "keepa_capacity_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"work_class" text NOT NULL,
	"keyword_id" uuid,
	"work_id" text,
	"reserved_tokens" integer,
	"actual_tokens" integer,
	"refill_rate" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reserved_at" timestamp,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "keepa_capacity_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"tokens_left" integer NOT NULL,
	"refill_rate" integer NOT NULL,
	"refill_in_ms" integer NOT NULL,
	"observed_at" timestamp NOT NULL,
	CONSTRAINT "keepa_capacity_singleton" CHECK ("keepa_capacity_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "keyword_discovery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid NOT NULL,
	"pass_id" uuid NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"page" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_exploration_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid NOT NULL,
	"source" text DEFAULT 'spapi' NOT NULL,
	"next_page_token" text,
	"last_page_fingerprint" text,
	"claim_at" timestamp,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"next_page" integer DEFAULT 0 NOT NULL,
	"contiguous_pages" integer DEFAULT 0 NOT NULL,
	"oldest_page_at" timestamp,
	"last_page_at" timestamp,
	"low_yield_pages" integer DEFAULT 0 NOT NULL,
	"stop_reason" text DEFAULT 'running' NOT NULL,
	"resume_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_exploration_page_check" CHECK ("keyword_exploration_passes"."next_page" >= 0 AND "keyword_exploration_passes"."contiguous_pages" >= 0)
);
--> statement-breakpoint
CREATE TABLE "keyword_products" (
	"query_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"first_observed_at" timestamp NOT NULL,
	"last_observed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_queries" DROP CONSTRAINT "catalog_queries_v1_identity_check";--> statement-breakpoint
DROP INDEX "catalog_queries_identity_idx";--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "tier" text DEFAULT 'stored' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "admission_reason" text;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "admitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "probation_until" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "next_due_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "interval_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "consecutive_empty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "demand_percentile" integer;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "demand_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "demotion_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "demotion_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD COLUMN "merch_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_search_runs" ADD COLUMN "page" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "history_admission_state" text DEFAULT 'notAdmitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "history_admission_reason" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "history_admitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD CONSTRAINT "keyword_discovery_attempts_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD CONSTRAINT "keyword_discovery_attempts_pass_id_keyword_exploration_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."keyword_exploration_passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_exploration_passes" ADD CONSTRAINT "keyword_exploration_passes_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_products" ADD CONSTRAINT "keyword_products_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_products" ADD CONSTRAINT "keyword_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keepa_capacity_attempts_recent_idx" ON "keepa_capacity_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "keepa_capacity_attempts_keyword_idx" ON "keepa_capacity_attempts" USING btree ("keyword_id","created_at");--> statement-breakpoint
CREATE INDEX "keyword_discovery_attempted_idx" ON "keyword_discovery_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "keyword_discovery_query_attempted_idx" ON "keyword_discovery_attempts" USING btree ("query_id","attempted_at");--> statement-breakpoint
CREATE INDEX "keyword_exploration_query_created_idx" ON "keyword_exploration_passes" USING btree ("query_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_exploration_active_query_idx" ON "keyword_exploration_passes" USING btree ("query_id") WHERE "keyword_exploration_passes"."stop_reason" in ('running', 'budget', 'jobCap');--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_products_membership_idx" ON "keyword_products" USING btree ("query_id","product_id");--> statement-breakpoint
CREATE INDEX "keyword_products_product_idx" ON "keyword_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_queries_identity_idx" ON "catalog_queries" USING btree ("source","marketplace_id","normalized_term");--> statement-breakpoint
ALTER TABLE "catalog_queries" DROP COLUMN "page";--> statement-breakpoint
ALTER TABLE "catalog_queries" ADD CONSTRAINT "catalog_queries_v1_identity_check" CHECK ("catalog_queries"."source" = 'keepa' AND "catalog_queries"."marketplace_id" = 'ATVPDKIKX0DER');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_history_admission_check" CHECK ((
                ("products"."history_admission_state" = 'notAdmitted'
                    AND "products"."history_admission_reason" IS NULL
                    AND "products"."history_admitted_at" IS NULL)
                OR ("products"."history_admission_state" = 'admitted'
                    AND "products"."history_admission_reason" IN ('legacy', 'capacity')
                    AND "products"."history_admission_reason" IS NOT NULL
                    AND "products"."history_admitted_at" IS NOT NULL)
                OR ("products"."history_admission_state" = 'paused'
                    AND "products"."history_admission_reason" = 'capacity'
                    AND "products"."history_admission_reason" IS NOT NULL)
            ));
--> statement-breakpoint
-- Every identity present at cutover keeps its existing history eligibility.
INSERT INTO history_admission_rollouts (key, baseline_at, baseline_products)
SELECT 'history-admission-v1', timezone('UTC', clock_timestamp()), count(*)::integer FROM products;
--> statement-breakpoint
UPDATE products SET history_admission_state = 'admitted',
    history_admission_reason = 'legacy',
    history_admitted_at = (SELECT baseline_at FROM history_admission_rollouts
        WHERE key = 'history-admission-v1');
--> statement-breakpoint
-- Preserve keyword membership from every retained successful observation.
INSERT INTO keyword_products (query_id, product_id, first_observed_at, last_observed_at)
SELECT runs.query_id, results.product_id,
    min(runs.source_completed_at), max(runs.source_completed_at)
FROM catalog_search_results results
JOIN catalog_search_runs runs ON runs.id = results.run_id
GROUP BY runs.query_id, results.product_id;
--> statement-breakpoint
-- Existing explicit research leases retain collection without an immediate refetch.
UPDATE catalog_queries SET tier = 'hot', admission_reason = 'researchLease',
    admitted_at = timezone('UTC', clock_timestamp()), interval_days = 1,
    next_due_at = coalesce(latest_successful_run_at + interval '1 day', timezone('UTC', clock_timestamp()))
WHERE active_until > timezone('UTC', clock_timestamp());
