CREATE TABLE "keyword_mining_capacity" (
	"provider" text PRIMARY KEY NOT NULL,
	"next_start_at" timestamp DEFAULT now() NOT NULL,
	"starts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mined_keyword_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" text NOT NULL,
	"term" text NOT NULL,
	"verdict" text,
	"probability" real,
	"judge_version" text,
	"judged_at" timestamp,
	"claim_token" uuid,
	"claim_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_keyword_candidates" (
	"product_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	CONSTRAINT "product_keyword_candidates_product_id_candidate_id_pk" PRIMARY KEY("product_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "product_keyword_mining" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"stage" text DEFAULT 'pending' NOT NULL,
	"recommendations" jsonb,
	"claim_token" uuid,
	"claim_at" timestamp,
	"next_due_at" timestamp DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"recommended_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_keyword_mining_claim_check" CHECK (("product_keyword_mining"."claim_token" is null)=("product_keyword_mining"."claim_at" is null))
);
--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "tracking" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "standing_tier" text DEFAULT 'unrated' NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "popularity_score" real;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "score_components" jsonb;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "head_product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "head_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "first_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "next_check_at" timestamp;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "interval_days" real DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "trial_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_targets" ADD COLUMN "demotion_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_keyword_candidates" ADD CONSTRAINT "product_keyword_candidates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_keyword_candidates" ADD CONSTRAINT "product_keyword_candidates_candidate_id_mined_keyword_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mined_keyword_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_keyword_mining" ADD CONSTRAINT "product_keyword_mining_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mined_keyword_candidates_identity_idx" ON "mined_keyword_candidates" USING btree ("marketplace_id","term");
--> statement-breakpoint
UPDATE discovery_targets t SET tracking='tracked' WHERE EXISTS
 (SELECT 1 FROM discovery_evidence e WHERE e.target_id=t.id AND e.kind='interest' AND e.eligible);
--> statement-breakpoint
UPDATE discovery_evidence SET eligible=false WHERE kind IN ('catalogFacet','catalogBrand');
--> statement-breakpoint
UPDATE discovery_targets t SET enabled=false WHERE tracking<>'tracked' AND NOT EXISTS
 (SELECT 1 FROM discovery_evidence e WHERE e.target_id=t.id AND e.eligible);
