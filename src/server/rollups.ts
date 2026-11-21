import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/pglite";
import { AUTO_EVENTS } from "@/lib/ingest";
import type * as schema from "@/server/db/schema";

// Daily rollups for the 12-month view: one row per project, UTC day, kind and key, written by the 10-minute cron for
// completed days. Raw events are kept 60 days, rollups 400. Counts only: visitor hashes never leave the events table.
// Takes the database as an argument so it is tested against an in-memory Postgres.

type Db = ReturnType<typeof drizzle<typeof schema>>;

const DAY = 86_400_000;
export const RAW_EVENT_DAYS = 60;
export const ROLLUP_DAYS = 400;
// Pages, events and sources kept per project and day: the busiest ones (size estimate in src/server/guard.ts)
export const ROLLUP_TOP = 50;

const AUTO = sql.raw(AUTO_EVENTS.map((n) => `'${n}'`).join(", "));
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

// Rewrites one completed UTC day: delete, then insert from the raw rows (idempotent)
export async function rollUpDay(db: Db, day: string): Promise<void> {
  const start = new Date(`${day}T00:00:00Z`);
  const end = new Date(start.getTime() + DAY);
  const inDay = sql`created_at >= ${start} and created_at < ${end}`;
  await db.execute(sql`delete from daily_stats where day = ${day} and kind <> 'month'`);
  await db.execute(sql`
    insert into daily_stats (project, day, kind, key, label, views, visitors, events, value_sum)
    select project, ${day}::date, 'total', '', '',
      count(*) filter (where type = 'pageview'),
      count(distinct visitor) filter (where type = 'pageview'),
      count(*) filter (where type = 'event' and name not in (${AUTO})),
      0
    from events where ${inDay} group by project`);
  await db.execute(sql`
    insert into daily_stats (project, day, kind, key, label, views, visitors, events, value_sum)
    select project, ${day}::date, 'page', key, '', views, visitors, 0, 0 from (
      select project, path as key, count(*) as views, count(distinct visitor) as visitors,
        row_number() over (partition by project order by count(*) desc, path) as n
      from events where type = 'pageview' and ${inDay} group by project, path
    ) t where n <= ${ROLLUP_TOP}`);
  await db.execute(sql`
    insert into daily_stats (project, day, kind, key, label, views, visitors, events, value_sum)
    select project, ${day}::date, 'source', key, '', views, visitors, 0, 0 from (
      select project, coalesce(source, referrer, '') as key, count(*) as views, count(distinct visitor) as visitors,
        row_number() over (partition by project order by count(*) desc, coalesce(source, referrer, '')) as n
      from events where type = 'pageview' and ${inDay} group by project, coalesce(source, referrer, '')
    ) t where n <= ${ROLLUP_TOP}`);
  await db.execute(sql`
    insert into daily_stats (project, day, kind, key, label, views, visitors, events, value_sum)
    select project, ${day}::date, 'event', key, label, 0, visitors, events, value_sum from (
      select project, name as key, coalesce(label, '') as label, count(*) as events, count(distinct visitor) as visitors,
        coalesce(sum(value), 0) as value_sum,
        row_number() over (partition by project order by count(*) desc, name, coalesce(label, '')) as n
      from events where type = 'event' and ${inDay} group by project, name, coalesce(label, '')
    ) t where n <= ${ROLLUP_TOP}`);
  await db.execute(sql`
    insert into daily_stats (project, day, kind, key, label, views, visitors, events, value_sum)
    select project, ${day}::date, 'device', coalesce(device, ''), '', count(*), count(distinct visitor), 0, 0
    from events where type = 'pageview' and ${inDay} group by project, coalesce(device, '')`);
}

// Distinct visitors of one completed UTC month ("2026-10"); only while all its raw rows are still kept
export async function rollUpMonth(db: Db, month: string): Promise<void> {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  await db.execute(sql`delete from daily_stats where day = ${`${month}-01`} and kind = 'month'`);
  await db.execute(sql`
    insert into daily_stats (project, day, kind, key, label, views, visitors, events, value_sum)
    select project, ${`${month}-01`}::date, 'month', '', '', count(*), count(distinct visitor), 0, 0
    from events where type = 'pageview' and created_at >= ${start} and created_at < ${end} group by project`);
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  return Array.isArray(result) ? result : ((result as { rows?: Record<string, unknown>[] }).rows ?? []);
}

// Called by the cron: yesterday always (late beacons), any older completed day still fully in the raw rows that has
// no rollup yet, and the previous month once it is complete. Returns the days written.
export async function runRollups(db: Db, now = new Date()): Promise<string[]> {
  const today = utcDay(now);
  const oldestFull = utcDay(new Date(new Date(`${today}T00:00:00Z`).getTime() - (RAW_EVENT_DAYS - 1) * DAY));
  const raw = rowsOf(
    await db.execute(sql`select distinct to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day from events
      where created_at >= ${new Date(`${oldestFull}T00:00:00Z`)} and created_at < ${new Date(`${today}T00:00:00Z`)}`),
  ).map((r) => String(r.day));
  const done = new Set(
    rowsOf(await db.execute(sql`select distinct day::text as day from daily_stats where kind = 'total' and day >= ${oldestFull}`)).map((r) => String(r.day)),
  );
  const yesterday = utcDay(new Date(new Date(`${today}T00:00:00Z`).getTime() - DAY));
  const days = [...new Set([...raw.filter((d) => !done.has(d)), ...(raw.includes(yesterday) ? [yesterday] : [])])].sort();
  for (const day of days) await rollUpDay(db, day);

  // The previous month, rewritten while every day of it is still in the raw rows
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  if (utcDay(monthStart) >= oldestFull) await rollUpMonth(db, utcDay(monthStart).slice(0, 7));
  return days;
}
