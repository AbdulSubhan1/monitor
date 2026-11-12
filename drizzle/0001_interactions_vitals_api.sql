CREATE TABLE "api_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"method" text NOT NULL,
	"host" text,
	"route" text NOT NULL,
	"status" integer,
	"ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vitals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"path" text NOT NULL,
	"lcp" integer,
	"inp" integer,
	"cls" real,
	"fcp" integer,
	"ttfb" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "label" text;--> statement-breakpoint
CREATE INDEX "api_calls_project_time" ON "api_calls" USING btree ("project","created_at");--> statement-breakpoint
CREATE INDEX "vitals_project_time" ON "vitals" USING btree ("project","created_at");