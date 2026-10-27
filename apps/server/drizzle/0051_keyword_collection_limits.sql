ALTER TABLE "keyword_mining_capacity" ADD COLUMN "daily_limit" integer;--> statement-breakpoint
ALTER TABLE "keyword_mining_capacity" ADD COLUMN "day" text;--> statement-breakpoint
ALTER TABLE "keyword_mining_capacity" ADD COLUMN "day_starts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_mining_capacity" ADD COLUMN "day_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "spapi_catalog_capacity" ADD COLUMN "background_max_rps" double precision DEFAULT 0.5 NOT NULL;