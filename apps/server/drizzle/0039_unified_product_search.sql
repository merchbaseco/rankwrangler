CREATE TABLE "official_brands" (
	"marketplace_id" text NOT NULL,
	"normalized_brand" text NOT NULL,
	"display_brand" text NOT NULL,
	"evidence_url" text NOT NULL,
	"verified_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "official_brands_marketplace_id_normalized_brand_pk" PRIMARY KEY("marketplace_id","normalized_brand"),
	CONSTRAINT "official_brands_normalized_brand_check" CHECK ("official_brands"."normalized_brand" <> '' AND "official_brands"."normalized_brand" =
                lower(btrim(regexp_replace("official_brands"."normalized_brand", '[[:space:]]+', ' ', 'g')))),
	CONSTRAINT "official_brands_evidence_url_check" CHECK ("official_brands"."evidence_url" ~ '^https?://[^[:space:]]+$')
);
--> statement-breakpoint
CREATE INDEX "products_search_document_idx" ON "products" USING gin ((
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("brand", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("bullet_1", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("bullet_2", '')), 'C')
));--> statement-breakpoint
CREATE INDEX "products_marketplace_created_idx" ON "products" USING btree ("marketplace_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "products_marketplace_bsr_idx" ON "products" USING btree ("marketplace_id","root_category_bsr","id");