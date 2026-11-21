// Every "day" in Pulse is a day in one timezone: buckets, "today", rollup days, the daily visitor hash and the daily
// caps. Change it here and everything follows.
export const DASHBOARD_TZ = "Asia/Karachi";

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DASHBOARD_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wall(date: Date) {
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

// How far the dashboard timezone is ahead of UTC at this instant, in ms
export function tzOffsetMs(date: Date): number {
  const w = wall(date);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// "2026-11-21": the local day of an instant
export function localDay(date: Date): string {
  const w = wall(date);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

// The UTC instant of local wall time y-m-d h:00 (months may overflow, as with Date.UTC)
export function localTime(y: number, m: number, d: number, h = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h);
  const first = guess - tzOffsetMs(new Date(guess));
  // A second pass settles it when the guess and the answer sit on different sides of a DST change
  return new Date(guess - tzOffsetMs(new Date(first)));
}

export function parseDay(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

// Local midnight at the start of the day this instant falls in
export function startOfLocalDay(date: Date): Date {
  const { y, m, d } = parseDay(localDay(date));
  return localTime(y, m, d);
}

// The local day `n` days after `day` (n may be negative)
export function addDays(day: string, n: number): string {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function localHour(date: Date): number {
  return wall(date).h;
}
