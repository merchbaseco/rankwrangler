ALTER TABLE "product_request_queue" RENAME TO "product_ingest_queue";--> statement-breakpoint
DROP INDEX "product_request_queue_marketplace_asin_idx";--> statement-breakpoint
DROP INDEX "product_request_queue_created_at_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "product_ingest_queue_marketplace_asin_idx" ON "product_ingest_queue" USING btree ("marketplace_id","asin");--> statement-breakpoint
CREATE INDEX "product_ingest_queue_created_at_idx" ON "product_ingest_queue" USING btree ("created_at");