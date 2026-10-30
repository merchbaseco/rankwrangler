CREATE TABLE "product_asin_aliases" (
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_asin_aliases_marketplace_id_asin_pk" PRIMARY KEY("marketplace_id","asin")
);
--> statement-breakpoint
ALTER TABLE "product_cutout_thumbnails" DROP CONSTRAINT "product_cutout_thumbnails_marketplace_id_asin_products_marketplace_id_asin_fk";
--> statement-breakpoint
ALTER TABLE "product_short_names" DROP CONSTRAINT "product_short_names_marketplace_id_asin_products_marketplace_id_asin_fk";
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "representative_asin" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variations_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_asin_aliases" ADD CONSTRAINT "product_asin_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_asin_aliases_product_idx" ON "product_asin_aliases" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "product_cutout_thumbnails" ADD CONSTRAINT "product_cutout_thumbnails_marketplace_id_asin_products_marketplace_id_asin_fk" FOREIGN KEY ("marketplace_id","asin") REFERENCES "public"."products"("marketplace_id","asin") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_short_names" ADD CONSTRAINT "product_short_names_marketplace_id_asin_products_marketplace_id_asin_fk" FOREIGN KEY ("marketplace_id","asin") REFERENCES "public"."products"("marketplace_id","asin") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "products_variations_unchecked_idx" ON "products" USING btree ("created_at") WHERE "products"."variations_checked_at" IS NULL;