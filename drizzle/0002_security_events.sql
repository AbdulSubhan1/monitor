CREATE TABLE "security_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"type" text NOT NULL,
	"source" text,
	"account" text,
	"account_hint" text,
	"path" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "security_project_time" ON "security_events" USING btree ("project","created_at");--> statement-breakpoint
CREATE INDEX "security_time" ON "security_events" USING btree ("created_at");