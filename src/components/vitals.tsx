import { formatMetric, METRICS, rate, type Metric, type Rating } from "@/lib/vitals";

const TONE: Record<Rating, string> = {
  good: "text-up",
  "needs-work": "text-warn",
  poor: "text-down",
  none: "text-muted",
};

const RATING_TEXT: Record<Rating, string> = { good: "Good", "needs-work": "Needs work", poor: "Poor", none: "No data" };

type Values = Partial<Record<Metric, number | null>>;

// One line for an overview card: the three Core Web Vitals, coloured by Google's thresholds
export function VitalsLine({ values }: { values: Values | undefined }) {
  if (!values) return <span className="text-muted">No performance data yet</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {(["lcp", "inp", "cls"] as const).map((m) => {
        const v = values[m] ?? null;
        return (
          <span key={m} title={METRICS[m].hint}>
            <span className="text-muted">{METRICS[m].name} </span>
            <span className={`font-mono tabular-nums ${TONE[rate(m, v)]}`}>{formatMetric(m, v)}</span>
          </span>
        );
      })}
    </span>
  );
}

// The project page's tiles: all five metrics with their rating and what they mean
export function VitalsTiles({ values }: { values: Values }) {
  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {(Object.keys(METRICS) as Metric[]).map((m) => {
        const v = values[m] ?? null;
        const r = rate(m, v);
        return (
          <div key={m}>
            <dt className="text-xs text-muted" title={METRICS[m].hint}>
              {METRICS[m].name}
            </dt>
            <dd className={`font-mono text-lg tabular-nums ${TONE[r]}`}>{formatMetric(m, v)}</dd>
            <dd className={`text-xs ${TONE[r]}`}>{RATING_TEXT[r]}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function MetricCell({ metric, value }: { metric: Metric; value: number | null }) {
  return <span className={`font-mono tabular-nums ${TONE[rate(metric, value)]}`}>{formatMetric(metric, value)}</span>;
}
