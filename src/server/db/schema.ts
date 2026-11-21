import { bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";

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

// Pageviews and named events from the beacon. No cookie, no IP, no user id. `visitor` is a keyed hash that changes
// every day (src/lib/visitor.ts), enough to count people per day and to group one visit's pages.
export const events = pgTable(
  "events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    project: text().notNull(),
    type: text({ enum: ["pageview", "event"] }).notNull(),
    // "pageview" for page views, the event name otherwise
    name: text().notNull(),
    // What exactly was clicked, e.g. the project for "project_opened" or where the button sits ("hero")
    label: text(),
    path: text().notNull(),
    referrer: text(),
    // Daily visitor hash; null on rows from before visitors were counted
    visitor: text(),
    // The ?ref= or utm_source tag of the link that brought the visitor (first page view of a load only)
    source: text(),
    device: text({ enum: ["mobile", "desktop"] }),
    // A measured amount: ms of visible time for "time_on_page"
    value: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_project_time").on(t.project, t.createdAt),
    index("events_project_time_visitor").on(t.project, t.createdAt, t.visitor),
  ],
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

// Core Web Vitals from real visitors: one row per page load, sent when the page is hidden. Times in ms; CLS has no unit.
export const vitals = pgTable(
  "vitals",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    project: text().notNull(),
    path: text().notNull(),
    lcp: integer(),
    inp: integer(),
    cls: real(),
    fcp: integer(),
    ttfb: integer(),
    device: text({ enum: ["mobile", "desktop"] }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vitals_project_time").on(t.project, t.createdAt)],
);

// API calls an app's server makes (or serves): route with ids replaced by ":id", status and time
export const apiCalls = pgTable(
  "api_calls",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    project: text().notNull(),
    method: text().notNull(),
    // The API's host for outgoing calls ("policydesk-opal.vercel.app"); null for the app's own routes
    host: text(),
    route: text().notNull(),
    // null when no response came back (timeout, network)
    status: integer(),
    ms: integer().notNull(),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_calls_project_time").on(t.project, t.createdAt)],
);

// Security events: failed and successful logins, blocks and bad tokens. The account and the source (IP) are stored only
// as keyed hashes, enough to group attempts, never the raw values; `accountHint` is a masked form for people ("ab***@x.dev").
export const securityEvents = pgTable(
  "security_events",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    // A project id, or "pulse" for attempts on Pulse itself
    project: text().notNull(),
    type: text({ enum: ["login_failed", "login_succeeded", "login_blocked", "auth_failed", "action_blocked"] }).notNull(),
    source: text(),
    account: text(),
    accountHint: text(),
    path: text(),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_project_time").on(t.project, t.createdAt), index("security_time").on(t.createdAt)],
);

// One row per project, local day (src/lib/time.ts), kind and key, written by the 10-minute cron for completed days.
// Raw events are kept 60 days; these are kept 400 so the 12-month view has data. Kinds:
//   total  key ""           all page views, visitors and tagged events of the day
//   page   key path         views and visitors of one page
//   event  key name, label  tagged and automatic events (value_sum: time_on_page ms)
//   source key source/host  page views and visitors per source ("" = unknown)
//   device key mobile/desktop
export const dailyStats = pgTable(
  "daily_stats",
  {
    project: text().notNull(),
    day: date({ mode: "string" }).notNull(),
    kind: text({ enum: ["total", "page", "event", "source", "device"] }).notNull(),
    key: text().notNull(),
    label: text().notNull().default(""),
    views: integer().notNull().default(0),
    visitors: integer().notNull().default(0),
    events: integer().notNull().default(0),
    valueSum: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.project, t.day, t.kind, t.key, t.label] }), index("daily_stats_day").on(t.day)],
);
