CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_key" text NOT NULL,
	"input" jsonb NOT NULL,
	"resource" jsonb,
	"error" jsonb,
	"dispatched_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operations_status_check" CHECK ("operations"."status" in ('pending', 'completed')),
	CONSTRAINT "operations_outcome_check" CHECK ((
                ("operations"."status" = 'pending'
                    AND "operations"."resource" IS NULL
                    AND "operations"."error" IS NULL
                    AND "operations"."completed_at" IS NULL)
                OR
                ("operations"."status" = 'completed'
                    AND "operations"."completed_at" IS NOT NULL
                    AND (("operations"."resource" IS NULL) <> ("operations"."error" IS NULL)))
            ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operations_pending_target_unique_idx" ON "operations" USING btree ("type","target_key") WHERE "operations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "operations_status_updated_at_idx" ON "operations" USING btree ("status","updated_at");