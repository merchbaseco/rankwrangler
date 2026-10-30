UPDATE "discovery_targets" SET "tracking"='dropped', "enabled"=false WHERE "tracking"='dormant' OR ("tracking"='trial' AND "trial_failures">0);--> statement-breakpoint
ALTER TABLE "discovery_targets" DROP COLUMN "trial_failures";
