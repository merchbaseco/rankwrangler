CREATE TABLE "brand_discovery_products" (
	"target_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"first_observed_at" timestamp NOT NULL,
	"last_observed_at" timestamp NOT NULL,
	CONSTRAINT "brand_discovery_products_target_id_product_id_pk" PRIMARY KEY("target_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "discovery_evidence" (
	"target_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"product_id" uuid,
	"eligible" boolean DEFAULT true NOT NULL,
	"observed_at" timestamp NOT NULL,
	"support_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "discovery_evidence_target_id_kind_source_key_pk" PRIMARY KEY("target_id","kind","source_key")
);
--> statement-breakpoint
CREATE TABLE "discovery_source_scans" (
	"key" text PRIMARY KEY NOT NULL,
	"cursor_created_at" timestamp,
	"cursor_product_id" uuid,
	"next_due_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope_key" text DEFAULT '' NOT NULL,
	"brand_name" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_selected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_targets_shape_check" CHECK (
        ("discovery_targets"."kind"='keyword' and "discovery_targets"."scope_key"='' and "discovery_targets"."brand_name" is null)
        or ("discovery_targets"."kind"='brand' and "discovery_targets"."scope_key"<>'' and "discovery_targets"."brand_name" is not null
            and length(btrim("discovery_targets"."brand_name"))>0)
    )
);
--> statement-breakpoint
CREATE TABLE "spapi_catalog_capacity" (
	"id" integer PRIMARY KEY NOT NULL,
	"effective_rps" double precision DEFAULT 1 NOT NULL,
	"observed_rate" double precision,
	"observed_at" timestamp,
	"tokens" double precision DEFAULT 0 NOT NULL,
	"background_tokens" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cooldown_until" timestamp,
	"last_throttle_at" timestamp,
	"foreground_starts" bigint DEFAULT 0 NOT NULL,
	"background_starts" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "spapi_catalog_capacity_singleton" CHECK ("spapi_catalog_capacity"."id"=1)
);
--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" DROP CONSTRAINT "keyword_discovery_attempts_query_id_catalog_queries_id_fk";
--> statement-breakpoint
ALTER TABLE "keyword_exploration_passes" DROP CONSTRAINT "keyword_exploration_passes_query_id_catalog_queries_id_fk";
--> statement-breakpoint
DROP INDEX "keyword_discovery_query_attempted_idx";--> statement-breakpoint
DROP INDEX "keyword_exploration_query_created_idx";--> statement-breakpoint
DROP INDEX "keyword_exploration_active_query_idx";--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "finished_at" timestamp;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "result_count" integer;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "new_products" integer;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "new_merch_products" integer;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "known_merch" integer;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "unknown_products" integer;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "non_merch_products" integer;--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" ADD COLUMN "new_merch_memberships" integer;--> statement-breakpoint
ALTER TABLE "keyword_exploration_passes" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "keyword_exploration_passes" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
-- Retain every old exploration identity and cursor under its ordinary keyword target.
INSERT INTO discovery_targets (query_id, kind, enabled, created_at)
SELECT id, 'keyword', false, created_at FROM catalog_queries;
--> statement-breakpoint
INSERT INTO discovery_evidence (target_id, kind, source_key, eligible, observed_at)
SELECT t.id, 'legacy', q.id::text, false,
    coalesce(q.latest_successful_run_at, q.created_at)
FROM discovery_targets t JOIN catalog_queries q ON q.id=t.query_id;
--> statement-breakpoint
-- Only demonstrable research interest enables old targets; broad BA rows are reconciled by fit.
INSERT INTO discovery_evidence (target_id, kind, source_key, eligible, observed_at)
SELECT t.id, 'interest', 'request', true,
    coalesce(q.last_requested_at, q.created_at)
FROM discovery_targets t JOIN catalog_queries q ON q.id=t.query_id
WHERE q.last_requested_at > timezone('UTC',now())-interval '90 days'
    OR q.active_until > timezone('UTC',now());
--> statement-breakpoint
UPDATE discovery_targets t SET enabled=true WHERE EXISTS (
    SELECT 1 FROM discovery_evidence e WHERE e.target_id=t.id AND e.eligible
);
--> statement-breakpoint
UPDATE keyword_exploration_passes p SET target_id=t.id,
    claim_token=CASE WHEN p.claim_at IS NULL THEN NULL ELSE gen_random_uuid() END
FROM discovery_targets t WHERE t.query_id=p.query_id AND t.kind='keyword';
--> statement-breakpoint
ALTER TABLE keyword_exploration_passes ALTER COLUMN target_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "brand_discovery_products" ADD CONSTRAINT "brand_discovery_products_target_id_discovery_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discovery_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_discovery_products" ADD CONSTRAINT "brand_discovery_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_evidence" ADD CONSTRAINT "discovery_evidence_target_id_discovery_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discovery_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_evidence" ADD CONSTRAINT "discovery_evidence_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD CONSTRAINT "discovery_targets_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_evidence_product_idx" ON "discovery_evidence" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "discovery_evidence_fresh_idx" ON "discovery_evidence" USING btree ("target_id","eligible","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_targets_scope_idx" ON "discovery_targets" USING btree ("query_id","kind","scope_key");--> statement-breakpoint
CREATE INDEX "discovery_targets_fairness_idx" ON "discovery_targets" USING btree ("enabled","last_selected_at");--> statement-breakpoint
ALTER TABLE "keyword_exploration_passes" ADD CONSTRAINT "keyword_exploration_passes_target_id_discovery_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discovery_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_discovery_accepted_page_idx" ON "keyword_discovery_attempts" USING btree ("pass_id","page") WHERE "keyword_discovery_attempts"."status"='accepted' and "keyword_discovery_attempts"."finished_at" is not null;--> statement-breakpoint
CREATE INDEX "keyword_discovery_pass_attempted_idx" ON "keyword_discovery_attempts" USING btree ("pass_id","attempted_at");--> statement-breakpoint
CREATE INDEX "keyword_exploration_target_created_idx" ON "keyword_exploration_passes" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_exploration_active_target_idx" ON "keyword_exploration_passes" USING btree ("target_id") WHERE "keyword_exploration_passes"."stop_reason" in ('running', 'budget', 'jobCap');--> statement-breakpoint
ALTER TABLE "keyword_discovery_attempts" DROP COLUMN "query_id";--> statement-breakpoint
ALTER TABLE "keyword_exploration_passes" DROP COLUMN "query_id";