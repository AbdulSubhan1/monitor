import "server-only";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";

const { checks, events, logs } = schema;
const HOUR = 3_600_000;
const since = (hours: number) => new Date(Date.now() - hours * HOUR);

export type ProjectSummary = {
  lastCheck: { ok: boolean; status: number | null; ms: number; at: Date } | null;
  uptime24h: number | null;
  avgMs24h: number | null;
  views24h: number;
  views7d: number;
  events24h: number;
  errors24h: number;
};

// Everything the overview cards need, in four grouped queries (not one per project)
export async function getSummaries(): Promise<Map<string, ProjectSummary>> {
  const [last, uptime, traffic, errors] = await Promise.all([
    db
      .selectDistinctOn([checks.project], {
        project: checks.project,
        ok: checks.ok,
        status: checks.status,
        ms: checks.ms,
        at: checks.checkedAt,
      })
      .from(checks)
      .orderBy(checks.project, desc(checks.checkedAt)),
    db
      .select({
        project: checks.project,
        up: sql<number>`avg(case when ${checks.ok} then 1.0 else 0 end)`.mapWith(Number),
        avgMs: sql<number>`avg(${checks.ms}) filter (where ${checks.ok})`.mapWith(Number),
      })
      .from(checks)
      .where(gte(checks.checkedAt, since(24)))
      .groupBy(checks.project),
    db
      .select({
        project: events.project,
        views24h: sql<number>`count(*) filter (where ${events.type} = 'pageview' and ${events.createdAt} >= ${since(24)})`.mapWith(Number),
        views7d: sql<number>`count(*) filter (where ${events.type} = 'pageview')`.mapWith(Number),
        events24h: sql<number>`count(*) filter (where ${events.type} = 'event' and ${events.createdAt} >= ${since(24)})`.mapWith(Number),
      })
      .from(events)
      .where(gte(events.createdAt, since(24 * 7)))
      .groupBy(events.project),
    db
      .select({ project: logs.project, count: sql<number>`count(*)`.mapWith(Number) })
      .from(logs)
      .where(and(eq(logs.level, "error"), gte(logs.createdAt, since(24))))
      .groupBy(logs.project),
  ]);

  const result = new Map<string, ProjectSummary>();
  const get = (project: string) => {
    let s = result.get(project);
    if (!s) {
      s = { lastCheck: null, uptime24h: null, avgMs24h: null, views24h: 0, views7d: 0, events24h: 0, errors24h: 0 };
      result.set(project, s);
    }
    return s;
  };
  for (const r of last) get(r.project).lastCheck = { ok: r.ok, status: r.status, ms: r.ms, at: r.at };
  for (const r of uptime) Object.assign(get(r.project), { uptime24h: r.up, avgMs24h: r.avgMs ? Math.round(r.avgMs) : null });
  for (const r of traffic) Object.assign(get(r.project), { views24h: r.views24h, views7d: r.views7d, events24h: r.events24h });
  for (const r of errors) get(r.project).errors24h = r.count;
  return result;
}

// Page views per UTC day for the last 7 days, oldest first, with empty days filled in
export async function getDailyViews(project?: string): Promise<{ day: string; project: string; views: number }[]> {
  const day = sql<string>`to_char(date_trunc('day', ${events.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
  const where: SQL[] = [eq(events.type, "pageview"), gte(events.createdAt, since(24 * 7))];
  if (project) where.push(eq(events.project, project));
  return db
    .select({ day, project: events.project, views: sql<number>`count(*)`.mapWith(Number) })
    .from(events)
    .where(and(...where))
    .groupBy(day, events.project);
}

export function lastSevenDays(): string[] {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 24 * HOUR).toISOString().slice(0, 10));
}

export async function getChecks24h(project: string) {
  return db
    .select({ ok: checks.ok, status: checks.status, ms: checks.ms, error: checks.error, at: checks.checkedAt })
    .from(checks)
    .where(and(eq(checks.project, project), gte(checks.checkedAt, since(24))))
    .orderBy(checks.checkedAt);
}

// Top pages, events and referring sites over 7 days
export async function getTop(project: string) {
  const window = and(eq(events.project, project), gte(events.createdAt, since(24 * 7)));
  const count = sql<number>`count(*)`.mapWith(Number);
  const [pages, named, referrers] = await Promise.all([
    db
      .select({ label: events.path, count })
      .from(events)
      .where(and(window, eq(events.type, "pageview")))
      .groupBy(events.path)
      .orderBy(desc(count))
      .limit(10),
    db
      .select({ label: events.name, count })
      .from(events)
      .where(and(window, eq(events.type, "event")))
      .groupBy(events.name)
      .orderBy(desc(count))
      .limit(10),
    db
      .select({ label: sql<string>`${events.referrer}`, count })
      .from(events)
      .where(and(window, eq(events.type, "pageview"), sql`${events.referrer} is not null`))
      .groupBy(events.referrer)
      .orderBy(desc(count))
      .limit(10),
  ]);
  return { pages, named, referrers };
}

export const LEVELS = ["debug", "info", "warn", "error"] as const;
export type Level = (typeof LEVELS)[number];

export async function getLogs(filter: { project?: string; level?: Level }, limit = 100) {
  const where: SQL[] = [];
  if (filter.project) where.push(eq(logs.project, filter.project));
  if (filter.level) where.push(eq(logs.level, filter.level));
  return db
    .select()
    .from(logs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(logs.createdAt))
    .limit(limit);
}
