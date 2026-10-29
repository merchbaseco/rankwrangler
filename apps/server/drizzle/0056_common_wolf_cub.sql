CREATE TABLE "keyword_standing_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"query_id" uuid NOT NULL,
	"observed_at" timestamp NOT NULL,
	"popularity_score" real,
	"standing_tier" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "keyword_standing_observations_source_check" CHECK ("keyword_standing_observations"."source" in ('search', 'storedRanks'))
);
--> statement-breakpoint
ALTER TABLE "keyword_standing_observations" ADD CONSTRAINT "keyword_standing_observations_target_id_discovery_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discovery_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_standing_observations" ADD CONSTRAINT "keyword_standing_observations_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_standing_observations_query_observed_idx" ON "keyword_standing_observations" USING btree ("query_id","observed_at");--> statement-breakpoint
CREATE INDEX "products_marketplace_first_available_idx" ON "products" USING btree ("marketplace_id","date_first_available" DESC NULLS LAST,"id");