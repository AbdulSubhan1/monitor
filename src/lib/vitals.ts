// Google's Core Web Vitals thresholds: at or under "good" is good, over "poor" is poor, in between needs work.
export const METRICS = {
  lcp: { name: "LCP", hint: "Largest Contentful Paint: main content shown", good: 2500, poor: 4000, unit: "ms" },
  inp: { name: "INP", hint: "Interaction to Next Paint: response to a click or tap", good: 200, poor: 500, unit: "ms" },
  cls: { name: "CLS", hint: "Cumulative Layout Shift: how much the page jumps", good: 0.1, poor: 0.25, unit: "" },
  fcp: { name: "FCP", hint: "First Contentful Paint: first thing on screen", good: 1800, poor: 3000, unit: "ms" },
  ttfb: { name: "TTFB", hint: "Time to First Byte: server answer", good: 800, poor: 1800, unit: "ms" },
} as const;

export type Metric = keyof typeof METRICS;
export type Rating = "good" | "needs-work" | "poor" | "none";

export function rate(metric: Metric, value: number | null): Rating {
  if (value === null) return "none";
  const { good, poor } = METRICS[metric];
  return value <= good ? "good" : value <= poor ? "needs-work" : "poor";
}

export function formatMetric(metric: Metric, value: number | null): string {
  if (value === null) return "–";
  if (metric === "cls") return value.toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

// How much a p75 can be trusted: 20+ page loads give a verdict, 5–19 only an early hint (never "poor" in red),
// under 5 no verdict at all
export const VERDICT_SAMPLES = 20;
export const HINT_SAMPLES = 5;
export type Confidence = "verdict" | "hint" | "few";

export function confidence(samples: number): Confidence {
  return samples >= VERDICT_SAMPLES ? "verdict" : samples >= HINT_SAMPLES ? "hint" : "few";
}

// The rating to show: under 5 samples none; an early hint caps "poor" at "needs-work" colours
export function shownRating(metric: Metric, value: number | null, samples: number): { rating: Rating; confidence: Confidence } {
  const c = confidence(samples);
  if (value === null || c === "few") return { rating: "none", confidence: c };
  const r = rate(metric, value);
  return { rating: c === "hint" && r === "poor" ? "needs-work" : r, confidence: c };
}

// Where a value sits on a good / needs work / poor scale drawn 40% / 24% / 36% wide (0–100)
export function scalePosition(metric: Metric, value: number): number {
  const { good, poor } = METRICS[metric];
  if (value <= good) return (value / good) * 40;
  if (value <= poor) return 40 + ((value - good) / (poor - good)) * 24;
  return Math.min(99, 64 + ((value - poor) / (poor * 1.5)) * 36);
}
