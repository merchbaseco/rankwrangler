CREATE TABLE "provider_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"attempted_at" timestamp NOT NULL,
	"status_code" integer,
	"is_error" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	CONSTRAINT "provider_attempts_latency_check" CHECK ("provider_attempts"."latency_ms" >= 0),
	CONSTRAINT "provider_attempts_status_code_check" CHECK ("provider_attempts"."status_code" IS NULL OR "provider_attempts"."status_code" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE INDEX "provider_attempts_attempted_at_idx" ON "provider_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "provider_attempts_provider_operation_attempted_at_idx" ON "provider_attempts" USING btree ("provider","operation","attempted_at");