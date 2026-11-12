import { z } from "zod";
import { findProject, PROJECT_IDS } from "@/lib/projects";

// Pure parsing for the two ingest endpoints, kept free of the database so it is unit tested on its own.

export const BEACON_MAX_BYTES = 4 * 1024;
export const LOGS_MAX_BYTES = 16 * 1024;
export const LOGS_MAX_BATCH = 20;

// Event names are snake_case words so the dashboard groups them cleanly ("lead_submitted", not "Lead Submitted!")
const eventName = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "use snake_case, at most 48 characters");
const path = z.string().max(300);

const beaconSchema = z.discriminatedUnion("type", [
  z.strictObject({
    project: z.enum(PROJECT_IDS),
    type: z.literal("pageview"),
    path,
    referrer: z.string().max(200).optional(),
  }),
  z.strictObject({ project: z.enum(PROJECT_IDS), type: z.literal("event"), name: eventName, path }),
  z.strictObject({
    project: z.enum(PROJECT_IDS),
    type: z.literal("error"),
    path,
    message: z.string().min(1).max(500),
    stack: z.string().max(2000).optional(),
  }),
]);

export type BeaconRow =
  | { table: "events"; project: string; type: "pageview" | "event"; name: string; path: string; referrer: string | null }
  | {
      table: "logs";
      project: string;
      level: "error";
      source: "browser";
      message: string;
      path: string;
      context: { stack: string } | null;
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
