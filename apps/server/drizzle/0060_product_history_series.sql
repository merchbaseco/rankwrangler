CREATE TABLE "product_history_series" (
	"product_id" uuid NOT NULL,
	"source" text NOT NULL,
	"metric" text NOT NULL,
	"category_id" bigint DEFAULT -1 NOT NULL,
	"keepa_minutes" integer[] NOT NULL,
	"keepa_values" integer[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_history_series_product_id_source_metric_category_id_pk" PRIMARY KEY("product_id","source","metric","category_id")
);
--> statement-breakpoint
ALTER TABLE "product_history_series" ADD CONSTRAINT "product_history_series_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;