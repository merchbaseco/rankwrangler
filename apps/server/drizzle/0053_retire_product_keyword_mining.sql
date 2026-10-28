DROP TABLE "autocomplete_keyword_candidates" CASCADE;--> statement-breakpoint
DROP TABLE "mined_keyword_candidates" CASCADE;--> statement-breakpoint
DROP TABLE "product_keyword_candidates" CASCADE;--> statement-breakpoint
DROP TABLE "product_keyword_mining" CASCADE;--> statement-breakpoint
ALTER TABLE "keyword_mining_capacity" DROP COLUMN "day_tokens";