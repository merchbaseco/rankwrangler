CREATE TABLE "automatic_sync_control" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"paused" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "automatic_sync_singleton" CHECK ("automatic_sync_control"."id"=1)
);

--> statement-breakpoint
INSERT INTO automatic_sync_control (id,paused) VALUES (1,true) ON CONFLICT DO NOTHING;
