ALTER TABLE "products" ADD COLUMN "is_unavailable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "products"
SET "is_unavailable" = true
WHERE "sp_api_resolved_at" IS NOT NULL
  AND (
    "sp_api_fetched_at" IS NULL
    OR "sp_api_resolved_at" > "sp_api_fetched_at"
  );
