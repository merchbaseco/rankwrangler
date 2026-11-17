CREATE TABLE "keepa_measured_costs" (
	"operation" text PRIMARY KEY NOT NULL,
	"recent_costs" integer[] NOT NULL,
	"cost" integer NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "keepa_measured_costs_operation_check" CHECK ("keepa_measured_costs"."operation" in ('product', 'search'))
);
--> statement-breakpoint
INSERT INTO "keepa_measured_costs" ("operation","recent_costs","cost","updated_at") SELECT operation,array_agg(cost ORDER BY settled_at,id),percentile_disc(0.95) WITHIN GROUP (ORDER BY cost),timezone('UTC',now()) FROM (SELECT operation,settled_at,id,ceil(actual_tokens::numeric/item_count)::integer cost,row_number() OVER (PARTITION BY operation ORDER BY settled_at DESC,id DESC) rn FROM "keepa_capacity_attempts" WHERE actual_tokens>0 AND operation IN ('product','search') AND settled_at IS NOT NULL) recent WHERE rn<=500 GROUP BY operation;--> statement-breakpoint
CREATE TABLE "product_stats" (
	"id" integer PRIMARY KEY NOT NULL,
	"observed_at" timestamp NOT NULL,
	"products" integer NOT NULL,
	"merch" integer NOT NULL,
	"new_24h" integer NOT NULL,
	"merch_with_history" integer NOT NULL,
	"merch_awaiting_first" integer NOT NULL,
	"merch_not_tracked" integer NOT NULL,
	"sp_api_lt_200k" integer NOT NULL,
	"sp_api_200k_to_500k" integer NOT NULL,
	"sp_api_500k_to_1m" integer NOT NULL,
	"sp_api_1m_to_3m" integer NOT NULL,
	"sp_api_gte_3m" integer NOT NULL,
	"sp_api_non_auto" integer NOT NULL,
	"history_twice_daily" integer NOT NULL,
	"history_daily" integer NOT NULL,
	"history_weekly" integer NOT NULL,
	"keepa_on_demand" integer NOT NULL,
	"keepa_merch_missing_bsr" integer NOT NULL,
	"keepa_non_merch" integer NOT NULL,
	"history_overdue" integer NOT NULL,
	"history_oldest_overdue_at" timestamp,
	"provider_calls" jsonb NOT NULL,
	CONSTRAINT "product_stats_singleton" CHECK ("product_stats"."id" = 1)
);
--> statement-breakpoint
DROP INDEX "keepa_capacity_attempts_keyword_idx";--> statement-breakpoint
CREATE INDEX "keepa_capacity_attempts_reserved_idx" ON "keepa_capacity_attempts" USING btree ("reserved_at");--> statement-breakpoint
CREATE INDEX "keepa_capacity_attempts_class_reserved_idx" ON "keepa_capacity_attempts" USING btree ("work_class","reserved_at");--> statement-breakpoint
CREATE INDEX "products_history_admission_candidate_idx" ON "products" USING btree ("root_category_bsr","created_at","id") WHERE "products"."history_admission_state" <> 'admitted'
                    AND "products"."amazon_listing_status" = 'active' AND "products"."is_merch_listing"
                    AND "products"."root_category_bsr" < 1000000;