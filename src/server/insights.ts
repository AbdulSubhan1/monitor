import "server-only";
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { MetricFacts, ProjectFacts } from "@/lib/facts";
import { AUTO_EVENTS } from "@/lib/ingest";
import { findProject, PROJECTS, type Project } from "@/lib/projects";
import { bucketFormat, dayLabel, monthLabel, type BucketUnit, type Range } from "@/lib/range";
import { localDay, startOfUtcDay } from "@/lib/time";
import { METRICS, type Metric } from "@/lib/vitals";
import { averageVisitMs, buildVisits, commonPaths, entriesAndExits, returningVisitors, topKey, type Visit, type VisitRow } from "@/lib/visits";
import { db, schema } from "@/server/db";

// Range queries for the dashboard. Grouped per project (never one query per project). 24h / 7d / 30d read raw rows,
// bucketed in the viewer's timezone. 12 months reads the UTC-day rollups for completed days plus raw rows for today
// (UTC), grouped into months; at month edges that can drift by the viewer's UTC offset.

const { events, checks, logs, vitals, apiCalls, dailyStats } = schema;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const RAW_DAYS = 60;
export const SHORT_DAYS = 30;

const bucketOf = (col: AnyPgColumn, unit: BucketUnit, tz: string) =>
  sql<string>`to_char(${col} at time zone ${tz}, ${sql.raw(`'${bucketFormat(unit)}'`)})`;
const dayOf = (col: AnyPgColumn, tz: string) => sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM-DD')`;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const AUTO_LIST = sql.raw(AUTO_EVENTS.map((n) => `'${n}'`).join(", "));
const tagged = sql`(${events.type} = 'event' and ${events.name} not in (${AUTO_LIST}))`;
const pageview = sql`(${events.type} = 'pageview')`;
const count = sql<number>`count(*)`.mapWith(Number);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function forProjects(col: AnyPgColumn, ids?: string[]): SQL | undefined {
  return ids ? inArray(col, ids) : undefined;
}

// 12 months: rollups hold completed UTC days, raw rows hold today (UTC)
function rawFrom(range: Range): Date {
  return range.key === "12m" ? startOfUtcDay(range.end) : range.prevStart;
}
const usesRollups = (range: Range) => range.key === "12m";
// Raw events are kept 60 days, checks, vitals and API calls 30: a range can only read what is kept
export const shortStart = (range: Range) => new Date(Math.max(range.start.getTime(), range.end.getTime() - SHORT_DAYS * DAY));
export const visitsStart = (range: Range) => new Date(Math.max(range.start.getTime(), range.end.getTime() - RAW_DAYS * DAY));

function hostsOf(p: Project): string[] {
  return [new URL(p.url).host, ...p.origins.map((o) => new URL(o).host)];
}

// Which other watched project a source or referring host means, if any
export function projectOfSource(key: string, except: string): string | null {
  const k = key.toLowerCase();
  for (const p of PROJECTS) {
    if (p.id === except) continue;
    if (k === p.id || k === p.name.toLowerCase() || hostsOf(p).includes(k)) return p.id;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Traffic: views, visitors and tagged events per bucket and per project, current and previous period

type BucketRow = { project: string; bucket: string; views: number; visitors: number; events: number };

async function trafficBuckets(range: Range, ids?: string[]): Promise<BucketRow[]> {
  const raw = db
    .select({
      project: events.project,
      bucket: bucketOf(events.createdAt, range.unit, range.tz),
      views: sql<number>`count(*) filter (where ${pageview})`.mapWith(Number),
      // On 12 months visitors come per month (below), not from today's rows
      visitors: usesRollups(range)
        ? sql<number>`0`.mapWith(Number)
        : sql<number>`count(distinct ${events.visitor}) filter (where ${pageview})`.mapWith(Number),
      events: sql<number>`count(*) filter (where ${tagged})`.mapWith(Number),
    })
    .from(events)
    .where(and(gte(events.createdAt, rawFrom(range)), forProjects(events.project, ids)))
    .groupBy(events.project, sql`2`);
  if (!usesRollups(range)) return raw;
  const month = sql<string>`substr(${dailyStats.day}::text, 1, 7)`;
  const rolled = db
    .select({
      project: dailyStats.project,
      bucket: month,
      views: sql<number>`coalesce(sum(${dailyStats.views}) filter (where ${dailyStats.kind} = 'total'), 0)`.mapWith(Number),
      visitors: sql<number>`coalesce(sum(${dailyStats.visitors}) filter (where ${dailyStats.kind} = 'month'), 0)`.mapWith(Number),
      events: sql<number>`coalesce(sum(${dailyStats.events}) filter (where ${dailyStats.kind} = 'total'), 0)`.mapWith(Number),
    })
    .from(dailyStats)
    .where(
      and(
        inArray(dailyStats.kind, ["total", "month"]),
        gte(dailyStats.day, `${utcDay(range.prevStart).slice(0, 8)}01`),
        lt(dailyStats.day, utcDay(range.end)),
        forProjects(dailyStats.project, ids),
      ),
    )
    .groupBy(dailyStats.project, sql`2`);
  // The month in progress has no month row yet: its people come from the raw rows (always within the 60 days kept)
  const monthStart = new Date(Date.UTC(range.end.getUTCFullYear(), range.end.getUTCMonth(), 1));
  const monthKey = utcDay(monthStart).slice(0, 7);
  const current = db
    .select({
      project: events.project,
      visitors: sql<number>`count(distinct ${events.visitor}) filter (where ${pageview})`.mapWith(Number),
    })
    .from(events)
    .where(and(gte(events.createdAt, monthStart), forProjects(events.project, ids)))
    .groupBy(events.project);
  const [a, b, c] = await Promise.all([raw, rolled, current]);
  return [
    ...a,
    // A month row for the current month would be partial; the raw count below replaces it
    ...b.map((r) => (r.bucket === monthKey ? { ...r, visitors: 0 } : r)),
    ...c.map((r) => ({ project: r.project, bucket: monthKey, views: 0, visitors: r.visitors, events: 0 })),
  ];
}

// Distinct visitors over the whole range: one person in several buckets counts once
async function visitorTotals(range: Range, ids?: string[]) {
  return db
    .select({
      project: events.project,
      cur: sql<number>`count(distinct ${events.visitor}) filter (where ${pageview} and ${events.createdAt} >= ${range.start})`.mapWith(Number),
      prev: sql<number>`count(distinct ${events.visitor}) filter (where ${pageview} and ${events.createdAt} < ${range.start})`.mapWith(Number),
    })
    .from(events)
    .where(and(gte(events.createdAt, range.prevStart), forProjects(events.project, ids)))
    .groupBy(events.project);
}

async function firsts(tz: string, ids?: string[]) {
  const [raw, rolled] = await Promise.all([
    db
      .select({
        project: events.project,
        first: sql<string | null>`min(${dayOf(events.createdAt, tz)})`,
        firstVisitor: sql<string | null>`min(${dayOf(events.createdAt, tz)}) filter (where ${events.visitor} is not null)`,
      })
      .from(events)
      .where(forProjects(events.project, ids))
      .groupBy(events.project),
    db
      .select({
        project: dailyStats.project,
        first: sql<string | null>`min(${dailyStats.day})::text`,
        firstVisitor: sql<string | null>`min(${dailyStats.day}) filter (where ${dailyStats.visitors} > 0)::text`,
      })
      .from(dailyStats)
      .where(and(eq(dailyStats.kind, "total"), forProjects(dailyStats.project, ids)))
      .groupBy(dailyStats.project),
  ]);
  const map = new Map<string, { first: string | null; firstVisitor: string | null }>();
  const earliest = (a: string | null | undefined, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
  for (const r of [...raw, ...rolled]) {
    const m = map.get(r.project);
    map.set(r.project, { first: earliest(m?.first, r.first), firstVisitor: earliest(m?.firstVisitor, r.firstVisitor) });
  }
  return map;
}

// Page views per kind/key in the current range: pages, sources, events (name + label)
type KeyRow = { project: string; key: string; label: string; views: number; visitors: number; events: number; valueSum: number };

async function rangeKeys(range: Range, kind: "page" | "source" | "event", ids?: string[]): Promise<KeyRow[]> {
  const from = usesRollups(range) ? startOfUtcDay(range.end) : range.start;
  const keyExpr =
    kind === "page"
      ? sql<string>`${events.path}`
      : kind === "source"
        ? sql<string>`coalesce(${events.source}, ${events.referrer}, '')`
        : sql<string>`${events.name}`;
  const labelExpr = kind === "event" ? sql<string>`coalesce(${events.label}, '')` : sql<string>`''`;
  const raw = db
    .select({
      project: events.project,
      key: keyExpr,
      label: labelExpr,
      views: kind === "event" ? sql<number>`0`.mapWith(Number) : count,
      visitors: sql<number>`count(distinct ${events.visitor})`.mapWith(Number),
      events: kind === "event" ? count : sql<number>`0`.mapWith(Number),
      valueSum: sql<number>`coalesce(sum(${events.value}), 0)`.mapWith(Number),
    })
    .from(events)
    .where(
      and(
        gte(events.createdAt, from),
        kind === "event" ? eq(events.type, "event") : eq(events.type, "pageview"),
        forProjects(events.project, ids),
      ),
    )
    .groupBy(events.project, sql`2`, sql`3`);
  if (!usesRollups(range)) return raw;
  const rolled = db
    .select({
      project: dailyStats.project,
      key: dailyStats.key,
      label: dailyStats.label,
      views: sql<number>`sum(${dailyStats.views})`.mapWith(Number),
      visitors: sql<number>`sum(${dailyStats.visitors})`.mapWith(Number),
      events: sql<number>`sum(${dailyStats.events})`.mapWith(Number),
      valueSum: sql<number>`sum(${dailyStats.valueSum})`.mapWith(Number),
    })
    .from(dailyStats)
    .where(
      and(
        eq(dailyStats.kind, kind),
        gte(dailyStats.day, utcDay(range.start)),
        lt(dailyStats.day, utcDay(range.end)),
        forProjects(dailyStats.project, ids),
      ),
    )
    .groupBy(dailyStats.project, dailyStats.key, dailyStats.label);
  const [a, b] = await Promise.all([raw, rolled]);
  // Same key from rollups and today: add up
  const merged = new Map<string, KeyRow>();
  for (const r of [...a, ...b]) {
    const id = `${r.project}\u0000${r.key}\u0000${r.label}`;
    const m = merged.get(id);
    if (!m) merged.set(id, { ...r });
    else {
      m.views += r.views;
      m.visitors += r.visitors;
      m.events += r.events;
      m.valueSum += r.valueSum;
    }
  }
  return [...merged.values()];
}

async function recentActivity(now: Date, ids?: string[]) {
  const cut = new Date(now.getTime() - 48 * HOUR);
  const [raw, rolled] = await Promise.all([
    db
      .select({
        project: events.project,
        views48h: sql<number>`count(*) filter (where ${pageview} and ${events.createdAt} >= ${cut})`.mapWith(Number),
        events48h: sql<number>`count(*) filter (where ${tagged} and ${events.createdAt} >= ${cut})`.mapWith(Number),
        eventsBefore: sql<number>`count(*) filter (where ${tagged} and ${events.createdAt} < ${cut})`.mapWith(Number),
      })
      .from(events)
      .where(forProjects(events.project, ids))
      .groupBy(events.project),
    db
      .select({ project: dailyStats.project, events: sql<number>`sum(${dailyStats.events})`.mapWith(Number) })
      .from(dailyStats)
      .where(and(eq(dailyStats.kind, "total"), forProjects(dailyStats.project, ids)))
      .groupBy(dailyStats.project),
  ]);
  const map = new Map<string, { views48h: number; events48h: number; eventsBefore48h: number; eventsEver: number }>();
  for (const r of raw) {
    map.set(r.project, { views48h: r.views48h, events48h: r.events48h, eventsBefore48h: r.eventsBefore, eventsEver: r.events48h + r.eventsBefore });
  }
  for (const r of rolled) {
    const m = map.get(r.project) ?? { views48h: 0, events48h: 0, eventsBefore48h: 0, eventsEver: 0 };
    // Rollup days are older than 48 hours unless they are yesterday; either way they existed before that
    m.eventsEver = Math.max(m.eventsEver, r.events);
    m.eventsBefore48h = Math.max(m.eventsBefore48h, r.events - m.events48h);
    map.set(r.project, m);
  }
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// Uptime, errors, vitals, API calls

async function checkFacts(range: Range, ids?: string[]) {
  const from = shortStart(range);
  const day = new Date(range.end.getTime() - DAY);
  const [last, agg] = await Promise.all([
    db
      .selectDistinctOn([checks.project], { project: checks.project, ok: checks.ok, at: checks.checkedAt })
      .from(checks)
      .where(forProjects(checks.project, ids))
      .orderBy(checks.project, desc(checks.checkedAt)),
    db
      .select({
        project: checks.project,
        checks: count,
        failed: sql<number>`count(*) filter (where not ${checks.ok})`.mapWith(Number),
        failed24h: sql<number>`count(*) filter (where not ${checks.ok} and ${checks.checkedAt} >= ${day})`.mapWith(Number),
        uptime: sql<number | null>`avg(case when ${checks.ok} then 1.0 else 0 end)`.mapWith(num),
        avgMs: sql<number | null>`avg(${checks.ms}) filter (where ${checks.ok})`.mapWith(num),
      })
      .from(checks)
      .where(and(gte(checks.checkedAt, from), forProjects(checks.project, ids)))
      .groupBy(checks.project),
  ]);
  return { last: new Map(last.map((r) => [r.project, r])), agg: new Map(agg.map((r) => [r.project, r])) };
}

async function errorFacts(range: Range, ids?: string[]) {
  const rows = await db
    .select({
      project: logs.project,
      cur: sql<number>`count(*) filter (where ${logs.createdAt} >= ${range.start})`.mapWith(Number),
      prev: sql<number>`count(*) filter (where ${logs.createdAt} < ${range.start})`.mapWith(Number),
    })
    .from(logs)
    .where(and(eq(logs.level, "error"), gte(logs.createdAt, range.prevStart), forProjects(logs.project, ids)))
    .groupBy(logs.project);
  return new Map(rows.map((r) => [r.project, r]));
}

const METRIC_KEYS = Object.keys(METRICS) as Metric[];
const metricCol = (m: Metric) => vitals[m];
const p75 = (col: AnyPgColumn, filter: SQL) =>
  sql<number | null>`percentile_cont(0.75) within group (order by ${col}) filter (where ${filter})`.mapWith(num);

export type Device = "mobile" | "desktop";

// p75 and sample count of each metric, current and previous period; one grouped query
export async function vitalsFacts(range: Range, ids?: string[], device?: Device): Promise<Map<string, Record<Metric, MetricFacts>>> {
  const from = shortStart(range);
  const prevFrom = new Date(from.getTime() - (range.end.getTime() - from.getTime()));
  const cur = sql`${vitals.createdAt} >= ${from}`;
  const prev = sql`${vitals.createdAt} < ${from}`;
  const select: Record<string, SQL.Aliased | SQL | AnyPgColumn> = { project: vitals.project };
  for (const m of METRIC_KEYS) {
    const col = metricCol(m);
    select[`${m}P75`] = p75(col, cur);
    select[`${m}N`] = sql<number>`count(${col}) filter (where ${cur})`.mapWith(Number);
    select[`${m}PrevP75`] = p75(col, prev);
    select[`${m}PrevN`] = sql<number>`count(${col}) filter (where ${prev})`.mapWith(Number);
  }
  const rows = (await db
    .select(select as never)
    .from(vitals)
    .where(and(gte(vitals.createdAt, prevFrom), forProjects(vitals.project, ids), device ? eq(vitals.device, device) : undefined))
    .groupBy(vitals.project)) as Record<string, unknown>[];
  const map = new Map<string, Record<Metric, MetricFacts>>();
  for (const r of rows) {
    const facts = {} as Record<Metric, MetricFacts>;
    for (const m of METRIC_KEYS) {
      facts[m] = {
        p75: num(r[`${m}P75`]),
        samples: Number(r[`${m}N`] ?? 0),
        prevP75: num(r[`${m}PrevP75`]),
        prevSamples: Number(r[`${m}PrevN`] ?? 0),
      };
    }
    map.set(r.project as string, facts);
  }
  return map;
}

export function emptyVitals(): Record<Metric, MetricFacts> {
  return Object.fromEntries(METRIC_KEYS.map((m) => [m, { p75: null, samples: 0, prevP75: null, prevSamples: 0 }])) as Record<
    Metric,
    MetricFacts
  >;
}

const failedCall = sql`(${apiCalls.status} is null or ${apiCalls.status} >= 500)`;

async function apiFacts(range: Range, ids?: string[]) {
  const rows = await db
    .select({
      project: apiCalls.project,
      calls: count,
      failed: sql<number>`count(*) filter (where ${failedCall})`.mapWith(Number),
      p95: sql<number | null>`percentile_cont(0.95) within group (order by ${apiCalls.ms})`.mapWith(num),
    })
    .from(apiCalls)
    .where(and(gte(apiCalls.createdAt, shortStart(range)), forProjects(apiCalls.project, ids)))
    .groupBy(apiCalls.project);
  return new Map(rows.map(({ project, ...r }) => [project, r]));
}

// ---------------------------------------------------------------------------------------------------------------
// Visits (computed from raw rows; on 12 months the last 60 days). All 60 days kept are read so a visitor's earlier
// visit, even before the range, makes them "returning".

const VISIT_ROWS_MAX = 50_000;

export type VisitData = { visits: Visit[]; returning: number };

export async function getVisits(range: Range, ids?: string[]): Promise<Map<string, VisitData>> {
  const rows = await db
    .select({ project: events.project, visitor: events.visitor, at: events.createdAt, type: events.type, name: events.name, path: events.path, label: events.label, value: events.value })
    .from(events)
    .where(
      and(
        gte(events.createdAt, new Date(range.end.getTime() - RAW_DAYS * DAY)),
        sql`${events.visitor} is not null`,
        sql`(${pageview} or ${events.name} in ('section_viewed', 'time_on_page'))`,
        forProjects(events.project, ids),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(VISIT_ROWS_MAX);
  const byProject = new Map<string, VisitRow[]>();
  for (const r of rows) {
    const list = byProject.get(r.project) ?? [];
    list.push({
      visitor: r.visitor!,
      at: r.at,
      kind: r.type === "pageview" ? "page" : r.name === "section_viewed" ? "section" : "time",
      key: r.type === "pageview" ? r.path : r.name === "section_viewed" ? (r.label ?? "") : r.path,
      value: r.value,
    });
    byProject.set(r.project, list);
  }
  const from = visitsStart(range);
  return new Map(
    [...byProject].map(([p, list]) => {
      const all = buildVisits(list);
      return [p, { visits: all.filter((v) => v.start >= from), returning: returningVisitors(all, from) }];
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Records: the busiest bucket ever recorded (days from rollups + raw; hours from raw only)

export const RECORD_MIN_VIEWS = 20;
export const RECORD_MIN_DAYS = 14;

async function busiest(range: Range, ids?: string[]) {
  const unit: BucketUnit = range.unit === "hour" ? "hour" : "day";
  const [raw, rolled] = await Promise.all([
    db
      .select({ project: events.project, bucket: bucketOf(events.createdAt, unit, range.tz), views: count })
      .from(events)
      .where(and(eq(events.type, "pageview"), forProjects(events.project, ids)))
      .groupBy(events.project, sql`2`),
    unit === "day"
      ? db
          .select({ project: dailyStats.project, bucket: sql<string>`${dailyStats.day}::text`, views: dailyStats.views })
          .from(dailyStats)
          .where(and(eq(dailyStats.kind, "total"), forProjects(dailyStats.project, ids)))
      : Promise.resolve([] as { project: string; bucket: string; views: number }[]),
  ]);
  // A day in both (yesterday rolled up, raw still kept) is the same day: keep the larger count, don't add
  const perBucket = new Map<string, Map<string, number>>();
  for (const r of [...raw, ...rolled]) {
    const m = perBucket.get(r.project) ?? new Map<string, number>();
    m.set(r.bucket, Math.max(m.get(r.bucket) ?? 0, r.views));
    perBucket.set(r.project, m);
  }
  const result = new Map<string, { key: string; views: number; previousBest: number }>();
  for (const [project, m] of perBucket) {
    let key = "";
    let views = 0;
    for (const [k, v] of m) if (v > views || (v === views && k > key)) [key, views] = [k, v];
    let previousBest = 0;
    for (const [k, v] of m) if (k !== key) previousBest = Math.max(previousBest, v);
    result.set(project, { key, views, previousBest });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------

export type RegressionSource = (projectIds: string[]) => Promise<Map<string, ProjectFacts["regressions"]>>;

// Everything the stories and the cards need for every project (or the given ones), in grouped queries
export async function getFacts(range: Range, ids?: string[], regressions?: RegressionSource): Promise<Map<string, ProjectFacts>> {
  const projects = ids ? PROJECTS.filter((p) => ids.includes(p.id)) : PROJECTS;
  const [buckets, totals, first, sources, pages, eventKeys, recent, checkF, errors, vit, api, visits, best, regs] = await Promise.all([
    trafficBuckets(range, ids),
    usesRollups(range) ? Promise.resolve([]) : visitorTotals(range, ids),
    firsts(range.tz, ids),
    rangeKeys(range, "source", ids),
    rangeKeys(range, "page", ids),
    rangeKeys(range, "event", ids),
    recentActivity(range.end, ids),
    checkFacts(range, ids),
    errorFacts(range, ids),
    vitalsFacts(range, ids),
    apiFacts(range, ids),
    getVisits(range, ids),
    busiest(range, ids),
    regressions ? regressions(projects.map((p) => p.id)) : Promise.resolve(new Map<string, ProjectFacts["regressions"]>()),
  ]);
  const firstBucket = range.buckets[0].key;
  const totalMap = new Map(totals.map((t) => [t.project, t]));

  const result = new Map<string, ProjectFacts>();
  for (const p of projects) {
    const mine = buckets.filter((b) => b.project === p.id);
    const cur = mine.filter((b) => b.bucket >= firstBucket);
    const prev = mine.filter((b) => b.bucket < firstBucket);
    const sum = (rows: BucketRow[], k: "views" | "visitors" | "events") => rows.reduce((s, r) => s + r[k], 0);
    const t = totalMap.get(p.id);
    const f = first.get(p.id);
    const c = checkF.agg.get(p.id);
    const last = checkF.last.get(p.id);
    const src = sources.filter((s) => s.project === p.id).sort((a, b) => b.views - a.views);
    const pg = pages.filter((s) => s.project === p.id).sort((a, b) => b.views - a.views);
    const ev = eventKeys.filter((s) => s.project === p.id);
    const taggedEv = ev.filter((e) => !(AUTO_EVENTS as readonly string[]).includes(e.key)).sort((a, b) => b.events - a.events);

    const referrals = new Map<string, number>();
    for (const s of src) {
      const from = s.key ? projectOfSource(s.key, p.id) : null;
      if (from) referrals.set(from, (referrals.get(from) ?? 0) + s.views);
    }
    const outbound = new Map<string, number>();
    for (const e of ev) {
      const target =
        e.key === "outbound_clicked" ? projectOfSource(e.label, p.id) : taggedEv.includes(e) && e.label ? projectOfSource(e.label, p.id) : null;
      if (target) outbound.set(target, (outbound.get(target) ?? 0) + e.events);
    }

    const vd = visits.get(p.id);
    const v = vd?.visits ?? [];
    const { bySections, paths } = commonPaths(v, 1);
    const topExit = topKey(entriesAndExits(v).exits);
    const top = paths[0];

    const b = best.get(p.id);
    const dataDays = f?.first ? Math.round((range.end.getTime() - new Date(`${f.first}T00:00:00Z`).getTime()) / DAY) : 0;
    const recordKey = b?.key ?? "";
    const inRange = range.unit === "hour" ? recordKey >= firstBucket : recordKey >= localDay(range.start, range.tz);
    const record =
      b && b.views >= RECORD_MIN_VIEWS && b.views > b.previousBest && dataDays >= RECORD_MIN_DAYS && inRange
        ? { key: recordKey, label: range.unit === "hour" ? `${dayLabel(recordKey.slice(0, 10))} ${recordKey.slice(11)}:00` : dayLabel(recordKey), views: b.views }
        : null;

    const r = recent.get(p.id) ?? { views48h: 0, events48h: 0, eventsBefore48h: 0, eventsEver: 0 };
    const e = errors.get(p.id);
    const a = api.get(p.id);
    result.set(p.id, {
      id: p.id,
      name: p.name,
      dataStart: f?.first ?? null,
      visitorsSince: f?.firstVisitor ?? null,
      status: {
        downNow: last ? !last.ok : null,
        checks: c?.checks ?? 0,
        failed: c?.failed ?? 0,
        failed24h: c?.failed24h ?? 0,
        uptime: c?.uptime ?? null,
        avgMs: c?.avgMs === null || c?.avgMs === undefined ? null : Math.round(c.avgMs),
      },
      views: sum(cur, "views"),
      prevViews: sum(prev, "views"),
      visitors: t ? t.cur : sum(cur, "visitors"),
      prevVisitors: t ? t.prev : sum(prev, "visitors"),
      returning: vd?.returning ?? 0,
      events: sum(cur, "events"),
      prevEvents: sum(prev, "events"),
      buckets: range.buckets.map((bk) => {
        const row = cur.filter((x) => x.bucket === bk.key);
        return { key: bk.key, label: range.unit === "month" ? monthLabel(bk.key) : bk.label, views: sum(row, "views"), visitors: sum(row, "visitors") };
      }),
      sources: src.slice(0, 50).map((s) => ({ key: s.key, views: s.views, visitors: s.visitors })),
      unknownViews: src.filter((s) => !s.key).reduce((n, s) => n + s.views, 0),
      ...r,
      errors: e?.cur ?? 0,
      prevErrors: e?.prev ?? 0,
      vitals: vit.get(p.id) ?? emptyVitals(),
      regressions: regs.get(p.id) ?? [],
      api: a && a.calls > 0 ? a : null,
      referrals: [...referrals].map(([from, views]) => ({ from, name: findProject(from)!.name, views })).sort((x, y) => y.views - x.views),
      outbound: [...outbound].map(([to, clicks]) => ({ to, name: findProject(to)!.name, clicks })).sort((x, y) => y.clicks - x.clicks),
      topPage: pg[0] ? { path: pg[0].key, views: pg[0].views } : null,
      pageCount: pg.length,
      topAction: taggedEv[0] ? { name: taggedEv[0].key, label: taggedEv[0].label || null, count: taggedEv[0].events } : null,
      topPath: top ? { ...top, bySections, endsAtTopExit: !bySections && top.steps[top.steps.length - 1] === topExit } : null,
      record,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Tab details for one project

export async function getPages(range: Range, project: string) {
  const [rows, visits] = await Promise.all([rangeKeys(range, "page", [project]), getVisits(range, [project])]);
  const v = visits.get(project)?.visits ?? [];
  const { exits } = entriesAndExits(v);
  return { rows: rows.map((r) => ({ path: r.key, views: r.views, visitors: r.visitors, exits: exits.get(r.key) ?? 0 })), visits: v };
}

export async function getVisitSummary(range: Range, project: string) {
  const data = (await getVisits(range, [project])).get(project);
  const v = data?.visits ?? [];
  return { visits: v.length, returning: data?.returning ?? 0, avgMs: averageVisitMs(v), paths: commonPaths(v), exits: entriesAndExits(v).exits };
}

export async function getEventGroups(range: Range, project: string) {
  return rangeKeys(range, "event", [project]);
}

// Latest page views, tagged events, outside links and downloads, newest first (scrolling, sections and time would
// drown the feed)
export async function getFeed(project: string, limit = 30) {
  return db
    .select({ at: events.createdAt, type: events.type, name: events.name, label: events.label, path: events.path, source: events.source, referrer: events.referrer })
    .from(events)
    .where(and(eq(events.project, project), sql`(${pageview} or ${tagged} or ${events.name} in ('outbound_clicked', 'file_downloaded'))`))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function getVitalsPages(range: Range, project: string, device?: Device) {
  const samples = sql<number>`count(*)`.mapWith(Number);
  const all = sql`true`;
  return db
    .select({
      path: vitals.path,
      samples,
      lcp: p75(vitals.lcp, all),
      inp: p75(vitals.inp, all),
      cls: p75(vitals.cls, all),
      lcpN: sql<number>`count(${vitals.lcp})`.mapWith(Number),
    })
    .from(vitals)
    .where(and(eq(vitals.project, project), gte(vitals.createdAt, shortStart(range)), device ? eq(vitals.device, device) : undefined))
    .groupBy(vitals.path)
    .orderBy(sql`3 desc nulls last`)
    .limit(15);
}

// p75 per bucket for the trend chart: hours on 24h, days otherwise (12 months shows the last 30 days kept)
export async function getVitalsTrend(range: Range, project: string, device?: Device) {
  const unit: BucketUnit = range.unit === "hour" ? "hour" : "day";
  const all = sql`true`;
  const select: Record<string, SQL | SQL.Aliased> = { bucket: bucketOf(vitals.createdAt, unit, range.tz) };
  for (const m of METRIC_KEYS) {
    select[m] = p75(metricCol(m), all);
    select[`${m}N`] = sql<number>`count(${metricCol(m)})`.mapWith(Number);
  }
  return (await db
    .select(select as never)
    .from(vitals)
    .where(and(eq(vitals.project, project), gte(vitals.createdAt, shortStart(range)), device ? eq(vitals.device, device) : undefined))
    .groupBy(sql`1`)
    .orderBy(sql`1`)) as Record<string, unknown>[];
}

export async function getChecks(range: Range, project: string) {
  return db
    .select({ ok: checks.ok, status: checks.status, ms: checks.ms, error: checks.error, at: checks.checkedAt })
    .from(checks)
    .where(and(eq(checks.project, project), gte(checks.checkedAt, shortStart(range))))
    .orderBy(checks.checkedAt);
}

export async function getApiRoutes(range: Range, project: string) {
  const calls = sql<number>`count(*)`.mapWith(Number);
  return db
    .select({
      method: apiCalls.method,
      host: apiCalls.host,
      route: apiCalls.route,
      calls,
      failed: sql<number>`count(*) filter (where ${failedCall})`.mapWith(Number),
      clientErrors: sql<number>`count(*) filter (where ${apiCalls.status} between 400 and 499)`.mapWith(Number),
      avg: sql<number>`avg(${apiCalls.ms})`.mapWith((v) => Math.round(Number(v))),
      p95: sql<number>`percentile_cont(0.95) within group (order by ${apiCalls.ms})`.mapWith((v) => Math.round(Number(v))),
    })
    .from(apiCalls)
    .where(and(eq(apiCalls.project, project), gte(apiCalls.createdAt, shortStart(range))))
    .groupBy(apiCalls.method, apiCalls.host, apiCalls.route)
    .orderBy(desc(calls))
    .limit(15);
}
