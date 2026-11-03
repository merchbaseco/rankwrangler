CREATE TABLE "product_variations" (
	"marketplace_id" text NOT NULL,
	"parent_asin" text NOT NULL,
	"generator_version" text NOT NULL,
	"state" text NOT NULL,
	"kind" text,
	"theme" jsonb,
	"children" jsonb,
	"member_asins" text[] NOT NULL,
	"claim_id" uuid NOT NULL,
	"attempted_at" timestamp NOT NULL,
	"fetched_at" timestamp,
	CONSTRAINT "product_variations_marketplace_id_parent_asin_pk" PRIMARY KEY("marketplace_id","parent_asin"),
	CONSTRAINT "product_variations_state_check" CHECK ("product_variations"."state" in ('pending', 'ready', 'error')),
	CONSTRAINT "product_variations_kind_check" CHECK ("product_variations"."kind" is null or "product_variations"."kind" in ('family', 'none'))
);
--> statement-breakpoint
CREATE INDEX "product_variations_member_asins_idx" ON "product_variations" USING gin ("member_asins");