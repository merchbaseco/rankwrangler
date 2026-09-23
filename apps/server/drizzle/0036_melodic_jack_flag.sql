CREATE TABLE "product_short_names" (
	"marketplace_id" text NOT NULL,
	"asin" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"state" text NOT NULL,
	"short_name" text,
	"claim_id" uuid NOT NULL,
	"attempted_at" timestamp NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "product_short_names_marketplace_id_asin_pk" PRIMARY KEY("marketplace_id","asin"),
	CONSTRAINT "product_short_names_state_check" CHECK ("product_short_names"."state" in ('pending', 'ready', 'error'))
);
--> statement-breakpoint
ALTER TABLE "product_short_names" ADD CONSTRAINT "product_short_names_marketplace_id_asin_products_marketplace_id_asin_fk" FOREIGN KEY ("marketplace_id","asin") REFERENCES "public"."products"("marketplace_id","asin") ON DELETE cascade ON UPDATE no action;