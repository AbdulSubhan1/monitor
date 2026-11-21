import type { Regression } from "@/lib/facts";
import { rate, type Metric, type Rating } from "@/lib/vitals";

// E4: did a deploy make real visitors' speed worse? Compares the p75 of the 7 days before a deploy with the 7 days
// after (up to now). It counts only with 20+ page loads on both sides, 20% or more worse, and a worse band
// (good -> needs work, or needs work -> poor). Pure, so it is tested on its own.

const DAY = 86_400_000;
export const REGRESSION_WINDOW_DAYS = 7;
export const REGRESSION_MIN_SAMPLES = 20;
export const REGRESSION_FACTOR = 1.2;
export const REGRESSION_METRICS: Metric[] = ["lcp", "inp", "cls", "ttfb"];

export type VitalsRow = { at: Date } & Partial<Record<Metric, number | null>>;
export type DeployPoint = { at: Date; commit: string | null };

// The same percentile Postgres's percentile_cont(0.75) gives: linear between the two nearest values
export function p75(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = 0.75 * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const BAND: Record<Rating, number> = { none: -1, good: 0, "needs-work": 1, poor: 2 };

// Deploys at or after `from` that made a metric worse; the latest one per metric
export function findRegressions(rows: VitalsRow[], deploys: DeployPoint[], from: Date, now: Date): Regression[] {
  const found = new Map<Metric, Regression>();
  const sorted = [...deploys].filter((d) => d.at >= from && d.at <= now).sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const d of sorted) {
    const t = d.at.getTime();
    const before = rows.filter((r) => r.at.getTime() >= t - REGRESSION_WINDOW_DAYS * DAY && r.at.getTime() < t);
    const after = rows.filter((r) => r.at.getTime() >= t && r.at.getTime() < Math.min(t + REGRESSION_WINDOW_DAYS * DAY, now.getTime()));
    for (const m of REGRESSION_METRICS) {
      const b = before.map((r) => r[m]).filter((v): v is number => typeof v === "number");
      const a = after.map((r) => r[m]).filter((v): v is number => typeof v === "number");
      if (b.length < REGRESSION_MIN_SAMPLES || a.length < REGRESSION_MIN_SAMPLES) continue;
      const pb = p75(b)!;
      const pa = p75(a)!;
      if (pa >= pb * REGRESSION_FACTOR && BAND[rate(m, pa)] > BAND[rate(m, pb)]) {
        found.set(m, { metric: m, commit: d.commit, at: d.at, before: pb, after: pa });
      }
    }
  }
  return [...found.values()];
}
