CREATE TABLE "product_cutout_thumbnails" (
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"state" text NOT NULL,
	"object_key" text,
	"claim_id" uuid NOT NULL,
	"attempted_at" timestamp NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "product_cutout_thumbnails_marketplace_id_asin_pk" PRIMARY KEY("marketplace_id","asin"),
	CONSTRAINT "product_cutout_thumbnails_state_check" CHECK ("product_cutout_thumbnails"."state" in ('pending', 'ready', 'error'))
);
--> statement-breakpoint
ALTER TABLE "product_cutout_thumbnails" ADD CONSTRAINT "product_cutout_thumbnails_marketplace_id_asin_products_marketplace_id_asin_fk" FOREIGN KEY ("marketplace_id","asin") REFERENCES "public"."products"("marketplace_id","asin") ON DELETE cascade ON UPDATE no action;