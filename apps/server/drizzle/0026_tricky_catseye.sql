CREATE TABLE "rankwrangler_cutover_gate" (
	"id" text PRIMARY KEY DEFAULT 'rankwrangler' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"plan_digest" text,
	"backup_fingerprint" text,
	"preservation_proof" text,
	"approved_by" text,
	"approved_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rankwrangler_cutover_gate_state_check" CHECK ("rankwrangler_cutover_gate"."state" in ('pending', 'approved', 'consumed'))
);
--> statement-breakpoint
ALTER TABLE "rankwrangler_service_accounts" DROP CONSTRAINT "rankwrangler_service_accounts_usage_check";--> statement-breakpoint
ALTER TABLE "rankwrangler_service_accounts" ADD CONSTRAINT "rankwrangler_service_accounts_usage_check" CHECK ("rankwrangler_service_accounts"."usage_today" >= 0 and "rankwrangler_service_accounts"."usage_count" >= 0 and ("rankwrangler_service_accounts"."usage_limit" = -1 or "rankwrangler_service_accounts"."usage_limit" >= 0));
