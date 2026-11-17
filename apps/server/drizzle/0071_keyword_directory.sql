CREATE TABLE "keyword_directory" (
	"query_id" uuid PRIMARY KEY NOT NULL,
	"target_id" uuid NOT NULL,
	"marketplace_id" text NOT NULL,
	"term" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"target_created_at" timestamp NOT NULL,
	"tracking" text NOT NULL,
	"enabled" boolean NOT NULL,
	"standing_tier" text NOT NULL,
	"popularity_score" real,
	"interval_days" real NOT NULL,
	"next_check_at" timestamp,
	"head_observed_at" timestamp,
	"pass_claimed_at" timestamp,
	"pass_failures" integer DEFAULT 0 NOT NULL,
	"pass_continuing" boolean DEFAULT false NOT NULL,
	"pass_resume_at" timestamp,
	"pass_last_page_at" timestamp,
	"product_count" integer DEFAULT 0 NOT NULL,
	"merch_count" integer DEFAULT 0 NOT NULL,
	"shelf_median_bsr" integer,
	"shelf_elite_count" integer DEFAULT 0 NOT NULL,
	"shelf_first_available" timestamp[] DEFAULT '{}'::timestamp[] NOT NULL
);
--> statement-breakpoint
INSERT INTO "keyword_directory" ("query_id","target_id","marketplace_id","term","created_at","target_created_at","tracking","enabled","standing_tier","popularity_score","interval_days","next_check_at","head_observed_at","pass_claimed_at","pass_failures","pass_continuing","pass_resume_at","pass_last_page_at","product_count","merch_count","shelf_median_bsr","shelf_elite_count","shelf_first_available")
WITH "merch" AS MATERIALIZED (
	SELECT id,root_category_bsr bsr,date_first_available first_available FROM "products"
	WHERE is_merch_listing AND amazon_listing_status='active'
), "passes" AS MATERIALIZED (
	SELECT target_id,created_at,id,claim_at,failure_count,stop_reason,resume_at,last_page_at FROM "keyword_exploration_passes"
), "heads" AS MATERIALIZED (
	SELECT t.id target_id,e.id::uuid product_id,e.ord FROM "discovery_targets" t
	CROSS JOIN jsonb_array_elements_text(t.head_product_ids) WITH ORDINALITY e(id,ord)
	WHERE t.kind='keyword' AND t.head_product_ids<>'[]'::jsonb
), "pass" AS (
	SELECT DISTINCT ON (target_id) * FROM "passes" ORDER BY target_id,created_at DESC,id DESC
), "counts" AS (
	SELECT kp.query_id,count(*)::int products,count(m.id)::int merch
	FROM "keyword_products" kp LEFT JOIN "merch" m ON m.id=kp.product_id GROUP BY kp.query_id
), "shelf" AS (
	SELECT s.target_id,round(percentile_cont(0.5) WITHIN GROUP (ORDER BY s.bsr))::int median_bsr,
		count(*) FILTER (WHERE s.bsr BETWEEN 1 AND 25000)::int elite,
		coalesce(array_agg(s.first_available ORDER BY s.ord) FILTER (WHERE s.first_available IS NOT NULL),'{}') first_available
	FROM (
		SELECT h.target_id,h.ord,m.bsr,m.first_available,row_number() OVER (PARTITION BY h.target_id ORDER BY h.ord) n
		FROM "heads" h JOIN "merch" m ON m.id=h.product_id
	) s WHERE s.n<=10 GROUP BY s.target_id
)
SELECT t.query_id,t.id,q.marketplace_id,q.normalized_term,q.created_at,t.created_at,t.tracking,t.enabled,
	t.standing_tier,t.popularity_score,t.interval_days,t.next_check_at,t.head_observed_at,p.claim_at,
	coalesce(p.failure_count,0),coalesce(p.stop_reason IN ('running','budget','jobCap'),false),p.resume_at,
	p.last_page_at,coalesce(c.products,0),coalesce(c.merch,0),sh.median_bsr,coalesce(sh.elite,0),
	coalesce(sh.first_available,'{}')
FROM "discovery_targets" t JOIN "catalog_queries" q ON q.id=t.query_id
LEFT JOIN "pass" p ON p.target_id=t.id
LEFT JOIN "counts" c ON c.query_id=t.query_id
LEFT JOIN "shelf" sh ON sh.target_id=t.id
WHERE t.kind='keyword';--> statement-breakpoint
ALTER TABLE "keyword_directory" ADD CONSTRAINT "keyword_directory_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_directory" ADD CONSTRAINT "keyword_directory_target_id_discovery_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."discovery_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_directory_target_idx" ON "keyword_directory" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "keyword_directory_term_idx" ON "keyword_directory" USING btree ("term");