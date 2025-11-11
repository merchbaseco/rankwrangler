CREATE TABLE "product_request_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "licenses_expires_at_idx";--> statement-breakpoint
ALTER TABLE "licenses" ALTER COLUMN "metadata" SET DEFAULT '{"features":[],"limits":{"requests_per_day":100000}}'::json;--> statement-breakpoint
CREATE UNIQUE INDEX "product_request_queue_marketplace_asin_idx" ON "product_request_queue" USING btree ("marketplace_id","asin");--> statement-breakpoint
CREATE INDEX "product_request_queue_created_at_idx" ON "product_request_queue" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "licenses" DROP COLUMN "expiresAt";