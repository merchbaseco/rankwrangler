CREATE TABLE "autocomplete_keyword_candidates" (
	"query_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	CONSTRAINT "autocomplete_keyword_candidates_query_id_candidate_id_pk" PRIMARY KEY("query_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "keyword_autocomplete" (
	"query_id" uuid PRIMARY KEY NOT NULL,
	"stage" text DEFAULT 'pending' NOT NULL,
	"suggestions" jsonb,
	"suggested_at" timestamp,
	"completed_at" timestamp,
	"claim_token" uuid,
	"claim_at" timestamp,
	"next_due_at" timestamp DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "keyword_autocomplete_claim_check" CHECK (("keyword_autocomplete"."claim_token" is null)=("keyword_autocomplete"."claim_at" is null))
);
--> statement-breakpoint
ALTER TABLE "autocomplete_keyword_candidates" ADD CONSTRAINT "autocomplete_keyword_candidates_query_id_keyword_autocomplete_query_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."keyword_autocomplete"("query_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autocomplete_keyword_candidates" ADD CONSTRAINT "autocomplete_keyword_candidates_candidate_id_mined_keyword_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."mined_keyword_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_autocomplete" ADD CONSTRAINT "keyword_autocomplete_query_id_catalog_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."catalog_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_autocomplete_due_idx" ON "keyword_autocomplete" USING btree ("next_due_at") WHERE "keyword_autocomplete"."stage"<>'complete';