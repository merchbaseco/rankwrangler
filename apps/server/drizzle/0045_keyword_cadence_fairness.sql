ALTER TABLE "discovery_targets" ADD COLUMN "demotion_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "spapi_catalog_capacity" ADD COLUMN "discovery_claims" integer DEFAULT 0 NOT NULL;