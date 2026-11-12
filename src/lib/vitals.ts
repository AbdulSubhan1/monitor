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
