ALTER TABLE "product_keyword_candidates" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "product_keyword_candidates" ADD COLUMN "relevance" real;--> statement-breakpoint
ALTER TABLE "product_keyword_candidates" ADD COLUMN "selected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_keyword_mining" ADD COLUMN "selection_version" text;