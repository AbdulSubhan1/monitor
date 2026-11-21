import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount } from "@/lib/format";
import type { Range } from "@/lib/range";
import { tagOf, type Story } from "@/lib/stories";
import { formatMetric, METRICS, scalePosition, shownRating, type Metric, type Rating } from "@/lib/vitals";
import type { Slide } from "@/components/story-slider";

// Server-rendered pieces shared by Home and the project tabs. Plain SVG and Tailwind, no library.

export function Card({ id, title, hint, aside, children, className = "" }: { id?: string; title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-6 rounded-xl border border-line bg-card p-4 md:px-6 md:py-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      {hint && <p className="-mt-2 mb-3 text-xs leading-relaxed text-muted">{hint}</p>}
      {children}
    </section>
  );
}

export function Hint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-relaxed text-muted ${className}`}>{children}</p>;
}

// A number with its one-line meaning under it
export function StatCard({ label, value, meaning }: { label: string; value: string; meaning: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-card p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-[26px] leading-tight tabular-nums">{value}</dd>
      <dd className="text-xs leading-relaxed text-muted">{meaning}</dd>
    </div>
  );
}

// Shown instead of a number when its data did not load: never a false "0"
export function LoadFailed({ what }: { what: string }) {
  return <p className="text-sm text-muted">Couldn&apos;t load {what}. Reload the page to try again.</p>;
}

// A share of the largest row, as a thin bar
export function ShareBar({ value, max, className = "bg-bar" }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-2 w-full overflow-hidden rounded bg-bar-soft" aria-hidden>
      <span className={`block h-full rounded ${className}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

type Point = { key: string; label: string; views: number; visitors: number };

// Page views (light) with visitors (dark) inside each bucket. Hover a bar for its numbers.
export function TrafficChart({ points, range, height = 120 }: { points: Point[]; range: Range; height?: number }) {
  const max = Math.max(1, ...points.map((p) => p.views));
  const w = 12;
  const width = points.length * w;
  const middle = points[Math.floor(points.length / 2)];
  const unit = range.unit === "hour" ? "hour" : range.unit === "day" ? "day" : "month";
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-bar-soft ring-1 ring-bar/30" /> Page views
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-bar" /> Visitors
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label={`Page views and visitors per ${unit}`}>
        {points.map((p, i) => {
          const hv = p.views ? Math.max(2, (p.views / max) * height) : 1;
          const hu = p.visitors ? Math.max(2, (p.visitors / max) * height) : 0;
          return (
            <g key={p.key}>
              <title>{`${p.label}: ${formatCount(p.views)} page views, ${formatCount(p.visitors)} visitors`}</title>
              <rect x={i * w + 1} y={height - hv} width={w - 2} height={hv} rx={1.5} className={p.views ? "fill-bar-soft" : "fill-line"} />
              {hu > 0 && <rect x={i * w + 3} y={height - hu} width={w - 6} height={hu} rx={1} className="fill-bar" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-xs text-muted">
        <span>{points[0]?.label}</span>
        <span>{middle?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

// The small per-bucket bars on a Home card
export function MiniBars({ points, label }: { points: { key: string; label: string; views: number }[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.views));
  const w = 12;
  return (
    <svg viewBox={`0 0 ${points.length * w} 40`} className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      {points.map((p, i) => {
        const h = p.views === 0 ? 1.5 : Math.max(3, (p.views / max) * 40);
        return (
          <rect key={p.key} x={i * w + 1} y={40 - h} width={w - 2} height={h} rx={1.5} className={p.views ? "fill-bar" : "fill-bar-soft"}>
            <title>{`${p.label}: ${formatCount(p.views)} page views`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const RATING_TAG: Record<Rating, { text: string; cls: string }> = {
  good: { text: "Good", cls: "bg-up-soft text-up-ink" },
  "needs-work": { text: "Needs work", cls: "bg-warn-soft text-warn-ink" },
  poor: { text: "Slow", cls: "bg-down-soft text-down-ink" },
  none: { text: "Too few loads", cls: "bg-line text-muted-ink" },
};

export function VerdictTag({ metric, value, samples }: { metric: Metric; value: number | null; samples: number }) {
  const { rating, confidence } = shownRating(metric, value, samples);
  const t = value === null ? { text: "No data", cls: RATING_TAG.none.cls } : RATING_TAG[rating];
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${t.cls}`}>
      {t.text}
      {confidence === "hint" && value !== null && " · early hint"}
    </span>
  );
}

// A value in its rating colour, greyed when there are too few loads to judge
export function MetricValue({ metric, value, samples }: { metric: Metric; value: number | null; samples: number }) {
  const { rating } = shownRating(metric, value, samples);
  const cls = { good: "bg-up-soft text-up-ink", "needs-work": "bg-warn-soft text-warn-ink", poor: "bg-down-soft text-down-ink", none: "text-muted" }[rating];
  return <span className={`inline-block rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums ${cls}`}>{formatMetric(metric, value)}</span>;
}

export const PLAIN_HELP: Record<Metric, string> = {
  lcp: "How long until the main picture or text appears.",
  inp: "How long the page takes to respond to a tap or click.",
  cls: "How much things jump around while loading. 0 is perfectly still.",
  fcp: "How long until anything at all is on screen.",
  ttfb: "Time until the server's first byte arrives.",
};

// "Page shows up": value, verdict, a good / needs work / poor scale with a marker, and the technical name small
export function MetricCard({ metric, title, value, samples }: { metric: Metric; title: string; value: number | null; samples: number }) {
  const { good, poor } = METRICS[metric];
  const pos = value === null ? null : scalePosition(metric, value);
  const { rating } = shownRating(metric, value, samples);
  return (
    <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-medium">{title}</h3>
        <VerdictTag metric={metric} value={value} samples={samples} />
      </div>
      <div className={`font-mono text-[26px] leading-tight tabular-nums ${rating === "none" ? "text-muted" : ""}`}>{formatMetric(metric, value)}</div>
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        className="h-2 w-full"
        role="img"
        aria-label={`${formatMetric(metric, value)} on a scale: good under ${formatMetric(metric, good)}, poor over ${formatMetric(metric, poor)}`}
      >
        <rect x="0" width="40" height="8" className="fill-up" opacity={rating === "none" ? 0.35 : 1} />
        <rect x="40" width="24" height="8" className="fill-warn" opacity={rating === "none" ? 0.35 : 1} />
        <rect x="64" width="36" height="8" className="fill-down" opacity={rating === "none" ? 0.35 : 1} />
        {pos !== null && <rect x={Math.max(0, pos - 1)} width="2" height="8" className="fill-ink" />}
      </svg>
      <p className="text-xs leading-relaxed text-muted">
        {PLAIN_HELP[metric]} Called <span className="font-mono">{METRICS[metric].name}</span>.{" "}
        {samples < 20 && value !== null && <>From {formatCount(samples)} {samples === 1 ? "load" : "loads"}, too few to be sure.</>}
      </p>
    </section>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink underline underline-offset-2 hover:text-bar">
      {children}
    </Link>
  );
}

// Stories from the engine, as the slider shows them
export function toSlides(stories: Story[], range: Range): Slide[] {
  return stories.map((s) => ({ id: s.id, tone: s.tone, tag: tagOf(s.tone, range.key), title: s.title, line: s.line, link: s.link, href: s.href }));
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}
