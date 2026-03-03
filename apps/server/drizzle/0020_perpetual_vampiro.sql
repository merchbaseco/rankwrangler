CREATE TABLE "product_facet_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facet" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_facet_values_facet_check" CHECK ("product_facet_values"."facet" in ('profession','hobby','animal','food','cause','identity','culture','holiday','occasion','place','party-theme'))
);
--> statement-breakpoint
CREATE TABLE "product_facets" (
	"product_id" uuid NOT NULL,
	"facet_value_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_facets_pk" PRIMARY KEY("product_id","facet_value_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "facets_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "facets_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_facets" ADD CONSTRAINT "product_facets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_facets" ADD CONSTRAINT "product_facets_facet_value_id_product_facet_values_id_fk" FOREIGN KEY ("facet_value_id") REFERENCES "public"."product_facet_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_facet_values_facet_name_unique_idx" ON "product_facet_values" USING btree ("facet","name");--> statement-breakpoint
CREATE INDEX "product_facet_values_facet_name_idx" ON "product_facet_values" USING btree ("facet","name");--> statement-breakpoint
CREATE INDEX "product_facets_facet_value_idx" ON "product_facets" USING btree ("facet_value_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_facets_state_check" CHECK ("products"."facets_state" in ('pending', 'ready', 'error'));