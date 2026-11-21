CREATE TABLE "daily_stats" (
	"project" text NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	"value_sum" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_stats_project_day_kind_key_label_pk" PRIMARY KEY("project","day","kind","key","label")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "visitor" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "device" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "value" integer;--> statement-breakpoint
ALTER TABLE "vitals" ADD COLUMN "device" text;--> statement-breakpoint
CREATE INDEX "daily_stats_day" ON "daily_stats" USING btree ("day");--> statement-breakpoint
CREATE INDEX "events_project_time_visitor" ON "events" USING btree ("project","created_at","visitor");