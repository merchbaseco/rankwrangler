CREATE TABLE "access_projection" (
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"state" text NOT NULL,
	"merchbase_user_id" text,
	"access" text,
	"access_valid_until" bigint,
	"source_updated_at" bigint NOT NULL,
	"last_event_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_projection_identity_pk" PRIMARY KEY("issuer","subject"),
	CONSTRAINT "access_projection_state_check" CHECK ("access_projection"."state" in ('active', 'tombstone')),
	CONSTRAINT "access_projection_access_check" CHECK ("access_projection"."access" is null or "access_projection"."access" in ('granted', 'not_granted'))
);
--> statement-breakpoint
CREATE TABLE "access_projection_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"source_updated_at" bigint NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankwrangler_service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text DEFAULT 'rankwrangler' NOT NULL,
	"merchbase_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"usage_today" integer DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer DEFAULT 100000 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rankwrangler_service_accounts_service_check" CHECK ("rankwrangler_service_accounts"."service" = 'rankwrangler'),
	CONSTRAINT "rankwrangler_service_accounts_usage_check" CHECK ("rankwrangler_service_accounts"."usage_today" >= 0 and "rankwrangler_service_accounts"."usage_count" >= 0 and "rankwrangler_service_accounts"."usage_limit" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "access_projection_merchbase_user_unique" ON "access_projection" USING btree ("merchbase_user_id") WHERE "access_projection"."state" = 'active' and "access_projection"."merchbase_user_id" is not null;--> statement-breakpoint
CREATE INDEX "access_projection_event_identity_idx" ON "access_projection_event" USING btree ("issuer","subject","source_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rankwrangler_service_accounts_service_unique" ON "rankwrangler_service_accounts" USING btree ("service");--> statement-breakpoint
CREATE UNIQUE INDEX "rankwrangler_service_accounts_merchbase_user_unique" ON "rankwrangler_service_accounts" USING btree ("merchbase_user_id") WHERE "rankwrangler_service_accounts"."merchbase_user_id" is not null;
