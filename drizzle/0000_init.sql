CREATE TABLE "checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"ok" boolean NOT NULL,
	"status" integer,
	"ms" integer NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"path" text,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "checks_project_time" ON "checks" USING btree ("project","checked_at");--> statement-breakpoint
CREATE INDEX "events_project_time" ON "events" USING btree ("project","created_at");--> statement-breakpoint
CREATE INDEX "logs_project_time" ON "logs" USING btree ("project","created_at");--> statement-breakpoint
CREATE INDEX "logs_time" ON "logs" USING btree ("created_at");