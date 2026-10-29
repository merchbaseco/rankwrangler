DROP TABLE "top_search_terms_datasets" CASCADE;--> statement-breakpoint
DROP TABLE "top_search_terms_keyword_daily" CASCADE;--> statement-breakpoint
DROP TABLE "top_search_terms_snapshots" CASCADE;--> statement-breakpoint
ALTER TABLE "catalog_queries" DROP COLUMN "demand_percentile";--> statement-breakpoint
ALTER TABLE "catalog_queries" DROP COLUMN "demand_observed_at";
--> statement-breakpoint
UPDATE discovery_evidence SET eligible=false WHERE kind='brandAnalytics';
