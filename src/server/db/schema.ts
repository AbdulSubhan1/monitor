import { bigserial, boolean, index, integer, jsonb, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

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
    // What exactly was clicked, e.g. the project for "project_opened" or where the button sits ("hero")
    label: text(),
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
