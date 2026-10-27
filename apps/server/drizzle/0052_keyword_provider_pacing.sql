ALTER TABLE "keyword_mining_capacity" ADD COLUMN "spacing_ms" integer;--> statement-breakpoint
ALTER TABLE "keyword_mining_capacity" ADD COLUMN "consecutive_throttles" integer DEFAULT 0 NOT NULL;