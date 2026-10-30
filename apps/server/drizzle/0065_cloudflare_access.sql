CREATE TABLE "access_delegation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caller" text NOT NULL,
	"receiver" text NOT NULL,
	"merchbase_user_id" text NOT NULL,
	"route" text NOT NULL,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "access_projection_merchbase_user_unique";--> statement-breakpoint
CREATE INDEX "access_projection_merchbase_user_idx" ON "access_projection" USING btree ("merchbase_user_id") WHERE "access_projection"."state" = 'active' and "access_projection"."merchbase_user_id" is not null;