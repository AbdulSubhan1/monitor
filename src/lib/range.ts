import { addDays, DASHBOARD_TZ, localDay, localHour, localTime, parseDay } from "@/lib/time";

// One range per page: every number, chart and story on it uses this. Starts sit on bucket boundaries in the viewer's
// timezone, and each range has a previous period of the same length for comparisons.
export const RANGES = ["24h", "7d", "30d", "12m"] as const;
export type RangeKey = (typeof RANGES)[number];
export type BucketUnit = "hour" | "day" | "month";

export const RANGE_LABEL: Record<RangeKey, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "12m": "12 months",
};

// Said in sentences: "No visitors this week", "in the last 30 days"
export const RANGE_PHRASE: Record<RangeKey, string> = {
  "24h": "in the last 24 hours",
  "7d": "this week",
  "30d": "in the last 30 days",
  "12m": "in the last 12 months",
};

export type Bucket = { key: string; label: string; start: Date };

export type Range = {
  key: RangeKey;
  // The viewer's timezone: buckets, days and "today" are theirs
  tz: string;
  unit: BucketUnit;
  start: Date;
  end: Date;
  prevStart: Date;
  buckets: Bucket[];
  // "Last 7 days · 15–21 Nov"
  words: string;
};

export function parseRange(raw: string | string[] | undefined): RangeKey {
  return typeof raw === "string" && (RANGES as readonly string[]).includes(raw) ? (raw as RangeKey) : "7d";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(day: string): string {
  const { m, d } = parseDay(day);
  return `${d} ${MONTHS[m - 1]}`;
}

function monthKey(y: number, m: number): string {
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

export function resolveRange(key: RangeKey, now = new Date(), tz = DASHBOARD_TZ): Range {
  const today = localDay(now, tz);
  const { y, m, d } = parseDay(today);
  if (key === "24h") {
    const hour = localHour(now, tz);
    const buckets: Bucket[] = Array.from({ length: 24 }, (_, i) => {
      const start = localTime(y, m, d, hour - 23 + i, tz);
      const day = localDay(start, tz);
      const h = localHour(start, tz);
      return { key: `${day}T${String(h).padStart(2, "0")}`, label: `${String(h).padStart(2, "0")}:00`, start };
    });
    const start = buckets[0].start;
    return {
      key,
      tz,
      unit: "hour",
      start,
      end: now,
      prevStart: new Date(start.getTime() - 24 * 3_600_000),
      buckets,
      words: `Last 24 hours · since ${dayLabel(localDay(start, tz))} ${buckets[0].label}`,
    };
  }
  if (key === "12m") {
    const buckets: Bucket[] = Array.from({ length: 12 }, (_, i) => {
      const start = localTime(y, m - 11 + i, 1, 0, tz);
      const k = localDay(start, tz).slice(0, 7);
      return { key: k, label: monthLabel(k), start };
    });
    const first = buckets[0].key;
    return {
      key,
      tz,
      unit: "month",
      start: buckets[0].start,
      end: now,
      prevStart: localTime(y, m - 23, 1, 0, tz),
      buckets,
      words: `Last 12 months · ${monthLabel(first, true)} – ${monthLabel(monthKey(y, m), true)}`,
    };
  }
  const days = key === "7d" ? 7 : 30;
  const buckets: Bucket[] = Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    const p = parseDay(day);
    return { key: day, label: dayLabel(day), start: localTime(p.y, p.m, p.d, 0, tz) };
  });
  const firstDay = buckets[0].key;
  const fp = parseDay(firstDay);
  const sameMonth = fp.m === m;
  return {
    key,
    tz,
    unit: "day",
    start: buckets[0].start,
    end: now,
    prevStart: localTime(fp.y, fp.m, fp.d - days, 0, tz),
    buckets,
    words: `Last ${days} days · ${sameMonth ? fp.d : dayLabel(firstDay)}–${dayLabel(today)}`,
  };
}

// The to_char format that gives the same bucket keys as resolveRange
export function bucketFormat(unit: BucketUnit): string {
  return unit === "hour" ? 'YYYY-MM-DD"T"HH24' : unit === "day" ? "YYYY-MM-DD" : "YYYY-MM";
}

