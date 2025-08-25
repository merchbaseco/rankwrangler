CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"email" text NOT NULL,
	"metadata" json DEFAULT '{"features":[],"limits":{"requests_per_day":1000}}'::json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"revokedAt" timestamp,
	"lastUsedAt" timestamp,
	"usageCount" integer DEFAULT 0 NOT NULL,
	"usageToday" integer DEFAULT 0 NOT NULL,
	"lastResetAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_key_unique" ON "licenses" USING btree ("key");--> statement-breakpoint
CREATE INDEX "licenses_email_idx" ON "licenses" USING btree ("email");--> statement-breakpoint
CREATE INDEX "licenses_expires_at_idx" ON "licenses" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "licenses_revoked_at_idx" ON "licenses" USING btree ("revokedAt");