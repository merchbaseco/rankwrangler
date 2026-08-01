DROP INDEX "rankwrangler_service_accounts_service_unique";--> statement-breakpoint
DROP INDEX "rankwrangler_service_accounts_merchbase_user_unique";--> statement-breakpoint
ALTER TABLE "rankwrangler_cutover_gate" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "rankwrangler_cutover_gate" ADD COLUMN "legacy_license_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "rankwrangler_cutover_gate" ADD COLUMN "service_account_id" uuid NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rankwrangler_cutover_gate_legacy_license_unique" ON "rankwrangler_cutover_gate" USING btree ("legacy_license_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rankwrangler_cutover_gate_service_account_unique" ON "rankwrangler_cutover_gate" USING btree ("service_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rankwrangler_service_accounts_service_merchbase_user_unique" ON "rankwrangler_service_accounts" USING btree ("service","merchbase_user_id") WHERE "rankwrangler_service_accounts"."merchbase_user_id" is not null;