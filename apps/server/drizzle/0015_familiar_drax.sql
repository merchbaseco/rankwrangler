CREATE TABLE "job_execution_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error_message" text,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_execution_logs" ADD CONSTRAINT "job_execution_logs_execution_id_job_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."job_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_execution_logs_execution_created_at_idx" ON "job_execution_logs" USING btree ("execution_id","created_at");--> statement-breakpoint
CREATE INDEX "job_executions_job_name_started_at_idx" ON "job_executions" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "job_executions_status_started_at_idx" ON "job_executions" USING btree ("status","started_at");