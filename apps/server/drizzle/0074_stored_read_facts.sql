CREATE TABLE "event_log_count_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"folded_through" timestamp NOT NULL,
	CONSTRAINT "event_log_count_state_singleton" CHECK ("event_log_count_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "event_log_counts" (
	"account_id" text NOT NULL,
	"bucket_minutes" smallint NOT NULL,
	"bucket_start" timestamp NOT NULL,
	"primitive_type" text NOT NULL,
	"level" text NOT NULL,
	"status" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "event_log_counts_pk" PRIMARY KEY("account_id","bucket_minutes","bucket_start","primitive_type","level","status"),
	CONSTRAINT "event_log_counts_bucket_minutes_check" CHECK ("event_log_counts"."bucket_minutes" in (1, 30))
);
--> statement-breakpoint
CREATE TABLE "product_search_facet_snapshot" (
	"id" integer PRIMARY KEY NOT NULL,
	"observed_at" timestamp NOT NULL,
	"facets" jsonb NOT NULL,
	CONSTRAINT "product_search_facet_snapshot_singleton" CHECK ("product_search_facet_snapshot"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "product_history_series" ADD COLUMN "lowest_point" integer[];--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "has_niche" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products" SET "has_niche"=true WHERE "id" IN (SELECT DISTINCT "product_id" FROM "product_facets");--> statement-breakpoint
CREATE INDEX "products_marketplace_brand_key_idx" ON "products" USING btree ("marketplace_id",lower(btrim(regexp_replace("brand", '[[:space:]]+', ' ', 'g'))));