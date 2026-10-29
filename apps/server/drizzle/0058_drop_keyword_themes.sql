ALTER TABLE "keyword_themes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "keyword_themes" CASCADE;--> statement-breakpoint
DROP INDEX "brand_analytics_search_terms_theme_idx";--> statement-breakpoint
ALTER TABLE "brand_analytics_search_terms" DROP COLUMN "theme";