import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One row per uptime check: every 10 minutes per project
export const checks = pgTable(
  "checks",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    project: text().notNull(),
    ok: boolean().notNull(),
    // null when the request never got a response (timeout, DNS, TLS)
    status: integer(),
    ms: integer().notNull(),
    error: text(),
    checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checks_project_time").on(t.project, t.checkedAt)],
);

// Pageviews and named events from the beacon. No cookie, no IP, no user id: counts only.
export const events = pgTable(
  "events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    project: text().notNull(),
    type: text({ enum: ["pageview", "event"] }).notNull(),
    // "pageview" for page views, the event name otherwise
    name: text().notNull(),
    path: text().notNull(),
    referrer: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_project_time").on(t.project, t.createdAt)],
);

// Errors and key logs: from app servers (with a token) and from browsers (through the beacon)
export const logs = pgTable(
  "logs",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    project: text().notNull(),
    level: text({ enum: ["debug", "info", "warn", "error"] }).notNull(),
    source: text({ enum: ["server", "browser"] }).notNull(),
    message: text().notNull(),
    path: text(),
    context: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("logs_project_time").on(t.project, t.createdAt), index("logs_time").on(t.createdAt)],
);
