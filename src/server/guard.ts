import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { db, schema } from "@/server/db";

// Keeps the free Neon database safe from floods: in-memory rate limits (no database cost) and daily row caps checked
// against cached counts. Over a cap, writes are skipped and the request still gets its normal answer.

// --- In-memory rate limit, per function instance (Vercel reuses warm instances; good enough to cut floods) -------
const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const limited = recent.length >= limit;
  if (!limited) recent.push(now);
  if (!hits.has(key) && hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value!);
  hits.set(key, recent);
  return limited;
}

// How many hits a key has in the window, without adding one
export function recentHits(key: string, windowMs: number, now = Date.now()): number {
  return (hits.get(key) ?? []).filter((t) => now - t < windowMs).length;
}

// --- Daily row caps -----------------------------------------------------------------------------------------------
// Real traffic is far below these. Worst case (every project at its cap for 30 days) stays well under Neon's 0.5 GB.
export const DAILY_CAPS = { events: 5_000, logs: 1_000, vitals: 2_000, api_calls: 5_000, security_events: 1_000 } as const;
export const DAILY_TOTAL_CAP = 30_000;
type Table = keyof typeof DAILY_CAPS;

const TABLES = {
  events: schema.events,
  logs: schema.logs,
  vitals: schema.vitals,
  api_calls: schema.apiCalls,
  security_events: schema.securityEvents,
} as const;

const CACHE_MS = 60_000;
const counts = new Map<string, { day: string; count: number; at: number }>();

function startOfDay(now: number): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function todayCount(table: Table, project: string | null, now: number): Promise<number> {
  const key = `${table}|${project ?? "*"}`;
  const day = startOfDay(now).toISOString();
  const cached = counts.get(key);
  if (cached && cached.day === day && now - cached.at < CACHE_MS) return cached.count;
  const t = TABLES[table];
  const where = project ? and(eq(t.project, project), gte(t.createdAt, startOfDay(now))) : gte(t.createdAt, startOfDay(now));
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(t).where(where);
  counts.set(key, { day, count: row.n, at: now });
  return row.n;
}

// True when this many more rows may be written today. Counts written since the last refresh are added locally.
export async function withinDailyCap(table: Table, project: string, rows = 1, now = Date.now()): Promise<boolean> {
  const perProject = await todayCount(table, project, now);
  if (perProject + rows > DAILY_CAPS[table]) return false;
  const total = await Promise.all((Object.keys(DAILY_CAPS) as Table[]).map((t) => todayCount(t, null, now)));
  if (total.reduce((a, b) => a + b, 0) + rows > DAILY_TOTAL_CAP) return false;
  for (const key of [`${table}|${project}`, `${table}|*`]) {
    const c = counts.get(key);
    if (c) c.count += rows;
  }
  return true;
}

// --- Keyed hashes for accounts and sources -----------------------------------------------------------------------
// HMAC with the server secret: the same email or IP always groups together, but the value can't be read back or
// guessed from a list without the secret.
export function keyedHash(kind: "account" | "source", value: string): string {
  const secret = process.env.LOG_SIGNING_SECRET ?? "local-only";
  return createHmac("sha256", secret).update(`${kind}:${value.trim().toLowerCase()}`).digest("base64url").slice(0, 16);
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
