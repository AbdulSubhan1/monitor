// Data is stored and rolled up in UTC (rollup days, daily caps). The dashboard shows it in the viewer's own timezone:
// the browser's, kept in the `pulse_tz` cookie, or `?tz=` for one request. Anything invalid falls back to this.
export const DASHBOARD_TZ = "UTC";
export const TZ_COOKIE = "pulse_tz";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

// An IANA name the runtime knows ("Asia/Karachi"), or null
export function validTz(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(raw)) return null;
  try {
    formatter(raw);
    return raw;
  } catch {
    return null;
  }
}

// ?tz= wins for that request, then the cookie, then UTC
export function resolveTz(param: string | string[] | undefined, cookie: string | undefined): string {
  return validTz(typeof param === "string" ? param : null) ?? validTz(cookie) ?? DASHBOARD_TZ;
}

function wall(date: Date, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

// How far the timezone is ahead of UTC at this instant, in ms
export function tzOffsetMs(date: Date, tz: string): number {
  const w = wall(date, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - Math.floor(date.getTime() / 1000) * 1000;
}

// "2026-11-21": the day an instant falls on in the timezone
export function localDay(date: Date, tz: string): string {
  const w = wall(date, tz);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

export function localHour(date: Date, tz: string): number {
  return wall(date, tz).h;
}

// "14:05" in the timezone
export function localClock(date: Date, tz: string): string {
  const w = wall(date, tz);
  return `${String(w.h).padStart(2, "0")}:${String(w.min).padStart(2, "0")}`;
}

// The instant of wall time y-m-d h:00 in the timezone (months, days and hours may overflow, as with Date.UTC)
export function localTime(y: number, m: number, d: number, h: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  // A second pass settles it when the guess and the answer sit on different sides of a DST change
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

export function parseDay(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

// Midnight at the start of the day this instant falls on, in the timezone
export function startOfLocalDay(date: Date, tz: string): Date {
  const { y, m, d } = parseDay(localDay(date, tz));
  return localTime(y, m, d, 0, tz);
}

export function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// The calendar day `n` days after `day` (n may be negative)
export function addDays(day: string, n: number): string {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
