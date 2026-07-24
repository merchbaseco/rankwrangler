CREATE TABLE "catalog_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"marketplace_id" text NOT NULL,
	"normalized_term" text NOT NULL,
	"display_term" text NOT NULL,
	"page" integer NOT NULL,
	"latest_successful_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_queries_v1_identity_check" CHECK ("catalog_queries"."source" = 'keepa' AND "catalog_queries"."marketplace_id" = 'ATVPDKIKX0DER' AND "catalog_queries"."page" = 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"source_position" integer NOT NULL,
	"observed_root_category_bsr" integer,
	"observed_new_price" integer,
	"observed_monthly_sold" integer,
	"observed_bsr_average_30" integer,
	"observed_bsr_average_90" integer,
	"observed_sales_rank_drops_30" integer,
	"observed_sales_rank_drops_90" integer,
	"observed_sales_rank_drops_180" integer,
	"observed_sales_rank_drops_365" integer,
	"observed_source_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_search_results_source_position_check" CHECK ("catalog_search_results"."source_position" >= 1 AND "catalog_search_results"."source_position" <= 20)
);
--> statement-breakpoint
CREATE TABLE "catalog_search_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"source_started_at" timestamp NOT NULL,
	"source_completed_at" timestamp NOT NULL,
	"result_count" integer NOT NULL,
	"normalizer_version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_search_runs_result_count_check" CHECK ("catalog_search_runs"."result_count" >= 0 AND "catalog_search_runs"."result_count" <= 20)
);
--> statement-breakpoint
ALTER TABLE "catalog_search_results" ADD CONSTRAINT "catalog_search_results_run_id_catalog_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."catalog_search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_search_results" ADD CONSTRAINT "catalog_search_results_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_search_runs" ADD CONSTRAINT "catalog_search_runs_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_search_runs" ADD CONSTRAINT "catalog_search_runs_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_queries_identity_idx" ON "catalog_queries" USING btree ("source","marketplace_id","normalized_term","page");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_search_results_run_product_idx" ON "catalog_search_results" USING btree ("run_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_search_results_run_position_idx" ON "catalog_search_results" USING btree ("run_id","source_position");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_search_runs_operation_idx" ON "catalog_search_runs" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "catalog_search_runs_query_created_at_idx" ON "catalog_search_runs" USING btree ("query_id","created_at");