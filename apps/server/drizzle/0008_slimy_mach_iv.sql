ALTER TABLE "licenses" ADD COLUMN "usageLimit" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "licenses" DROP COLUMN "metadata";