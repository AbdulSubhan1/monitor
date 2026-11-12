import { z } from "zod";
import { findProject, PROJECT_IDS } from "@/lib/projects";

// Pure parsing for the ingest endpoints, kept free of the database so it is unit tested on its own.

export const BEACON_MAX_BYTES = 4 * 1024;
export const LOGS_MAX_BYTES = 16 * 1024;
export const LOGS_MAX_BATCH = 20;
export const CALLS_MAX_BATCH = 50;

// Event names are snake_case words so the dashboard groups them cleanly ("lead_submitted", not "Lead Submitted!")
const eventName = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "use snake_case, at most 48 characters");
const path = z.string().max(300);
// Free text, but short: it is a dimension to group by, not a message
const label = z.string().trim().min(1).max(80);
// A browser timing in ms; over a minute is a broken measurement, not a slow page
const ms = z.number().int().min(0).max(60_000);

const beaconSchema = z.discriminatedUnion("type", [
  z.strictObject({
    project: z.enum(PROJECT_IDS),
    type: z.literal("pageview"),
    path,
    referrer: z.string().max(200).optional(),
  }),
  z.strictObject({ project: z.enum(PROJECT_IDS), type: z.literal("event"), name: eventName, label: label.optional(), path }),
  z.strictObject({
    project: z.enum(PROJECT_IDS),
    type: z.literal("error"),
    path,
    message: z.string().min(1).max(500),
    stack: z.string().max(2000).optional(),
  }),
  // Core Web Vitals of one page load. Anything a browser could not measure is simply left out.
  z.strictObject({
    project: z.enum(PROJECT_IDS),
    type: z.literal("vitals"),
    path,
    lcp: ms.optional(),
    inp: ms.optional(),
    cls: z.number().min(0).max(10).optional(),
    fcp: ms.optional(),
    ttfb: ms.optional(),
  }),
]);

export type BeaconRow =
  | {
      table: "events";
      project: string;
      type: "pageview" | "event";
      name: string;
      label: string | null;
      path: string;
      referrer: string | null;
    }
  | {
      table: "logs";
      project: string;
      level: "error";
      source: "browser";
      message: string;
      path: string;
      context: { stack: string } | null;
    }
  | {
      table: "vitals";
      project: string;
      path: string;
      lcp: number | null;
      inp: number | null;
      cls: number | null;
      fcp: number | null;
      ttfb: number | null;
    };

export type Parsed<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

// Paths are stored without query string or hash: they can carry tokens, emails or search terms
export function cleanPath(raw: string): string {
  const cut = raw.split(/[?#]/)[0] || "/";
  return cut.startsWith("/") ? cut : `/${cut}`;
}

// Only the referring site's host is kept, never the full URL
function referrerHost(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

export function parseBeacon(body: string, origin: string | null): Parsed<BeaconRow> {
  if (new TextEncoder().encode(body).length > BEACON_MAX_BYTES) {
    return { ok: false, status: 413, error: "payload too large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
  const parsed = beaconSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const data = parsed.data;
  // A browser always sends Origin on a cross-site POST; a missing or foreign one is not one of my sites
  if (!origin || !findProject(data.project)?.origins.includes(origin)) {
    return { ok: false, status: 403, error: "origin not allowed for this project" };
  }
  const pagePath = cleanPath(data.path);
  if (data.type === "vitals") {
    if ([data.lcp, data.inp, data.cls, data.fcp, data.ttfb].every((v) => v === undefined)) {
      return { ok: false, status: 400, error: "no metric measured" };
    }
    return {
      ok: true,
      value: {
        table: "vitals",
        project: data.project,
        path: pagePath,
        lcp: data.lcp ?? null,
        inp: data.inp ?? null,
        cls: data.cls ?? null,
        fcp: data.fcp ?? null,
        ttfb: data.ttfb ?? null,
      },
    };
  }
  if (data.type === "error") {
    return {
      ok: true,
      value: {
        table: "logs",
        project: data.project,
        level: "error",
        source: "browser",
        message: data.message,
        path: pagePath,
        context: data.stack ? { stack: data.stack } : null,
      },
    };
  }
  return {
    ok: true,
    value: {
      table: "events",
      project: data.project,
      type: data.type,
      name: data.type === "pageview" ? "pageview" : data.name,
      label: data.type === "event" ? (data.label ?? null) : null,
      path: pagePath,
      referrer: data.type === "pageview" ? referrerHost(data.referrer) : null,
    },
  };
}

const logSchema = z.strictObject({
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string().min(1).max(2000),
  path: path.optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type LogInput = z.infer<typeof logSchema>;

// One log or a batch of up to 20
export function parseLogs(body: string): Parsed<LogInput[]> {
  if (new TextEncoder().encode(body).length > LOGS_MAX_BYTES) {
    return { ok: false, status: 413, error: "payload too large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
  const parsed = z.union([logSchema, z.array(logSchema).min(1).max(LOGS_MAX_BATCH)]).safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  return { ok: true, value: list.map((l) => ({ ...l, path: l.path ? cleanPath(l.path) : undefined })) };
}

// Ids in a URL path become ":id" so calls group by route: UUIDs, numbers and long random tokens
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,})$/i;

export function routeOf(raw: string): string {
  return cleanPath(raw)
    .split("/")
    .map((segment) => (ID_SEGMENT.test(segment) ? ":id" : segment))
    .join("/");
}

const callSchema = z.strictObject({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  // The called API's host for outgoing calls; left out for the app's own routes
  host: z.string().max(100).optional(),
  path,
  // null: no response (timeout or network error)
  status: z.number().int().min(100).max(599).nullable(),
  ms: z.number().int().min(0).max(120_000),
  error: z.string().max(300).optional(),
});

export type CallRow = {
  method: string;
  host: string | null;
  route: string;
  status: number | null;
  ms: number;
  error: string | null;
};

// One API call or a batch of up to 50; the token says which project they belong to
export function parseCalls(body: string): Parsed<CallRow[]> {
  if (new TextEncoder().encode(body).length > LOGS_MAX_BYTES) {
    return { ok: false, status: 413, error: "payload too large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
  const parsed = z.union([callSchema, z.array(callSchema).min(1).max(CALLS_MAX_BATCH)]).safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const list = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  return {
    ok: true,
    value: list.map((c) => ({
      method: c.method,
      host: c.host ?? null,
      route: routeOf(c.path),
      status: c.status,
      ms: c.ms,
      error: c.error ?? null,
    })),
  };
}
