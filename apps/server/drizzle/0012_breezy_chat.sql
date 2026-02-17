CREATE TABLE "product_history_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"request_params" jsonb NOT NULL,
	"response_payload" jsonb,
	"tokens_consumed" integer,
	"tokens_left" integer,
	"refill_in_ms" integer,
	"refill_rate" integer,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_history_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"source" text NOT NULL,
	"metric" text NOT NULL,
	"category_id" bigint DEFAULT -1 NOT NULL,
	"observed_at" timestamp NOT NULL,
	"keepa_minutes" integer NOT NULL,
	"value_int" integer,
	"is_missing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_history_imports" ADD CONSTRAINT "product_history_imports_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_history_points" ADD CONSTRAINT "product_history_points_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_history_imports_product_created_at_idx" ON "product_history_imports" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_history_imports_marketplace_asin_created_at_idx" ON "product_history_imports" USING btree ("marketplace_id","asin","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_history_points_unique_idx" ON "product_history_points" USING btree ("product_id","source","metric","category_id","keepa_minutes");--> statement-breakpoint
CREATE INDEX "product_history_points_marketplace_asin_metric_observed_at_idx" ON "product_history_points" USING btree ("marketplace_id","asin","metric","observed_at");