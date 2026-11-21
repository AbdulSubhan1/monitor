import Link from "next/link";
import { Card, Empty, Hint, LoadFailed, MetricCard, MetricValue } from "@/components/insight";
import { hrefWith } from "@/components/range-picker";
import { formatCount } from "@/lib/format";
import { dayLabel, resolveRange, type Range } from "@/lib/range";
import { localDay, localHour } from "@/lib/time";
import { PLAIN_METRIC, STORY_METRICS } from "@/lib/stories";
import { formatMetric, METRICS, rate, type Metric } from "@/lib/vitals";
import { emptyVitals, getVitalsPages, getVitalsTrend, vitalsFacts, type Device } from "@/server/insights";

export const DEVICES = ["all", "mobile", "desktop"] as const;
export type DeviceChoice = (typeof DEVICES)[number];

export function parseDevice(raw: string | string[] | undefined): DeviceChoice {
  return typeof raw === "string" && (DEVICES as readonly string[]).includes(raw) ? (raw as DeviceChoice) : "all";
}

const DEVICE_TEXT: Record<DeviceChoice, string> = { all: "All devices", mobile: "Mobile", desktop: "Desktop" };

export type DeployMark = { at: Date; commit: string | null };

export async function PerformanceTab({
  id,
  range,
  device,
  params,
  deploys,
}: {
  id: string;
  range: Range;
  device: DeviceChoice;
  params: Record<string, string | undefined>;
  deploys: DeployMark[];
}) {
  const d: Device | undefined = device === "all" ? undefined : device;
  const [facts, pages, trend] = await Promise.all([
    vitalsFacts(range, [id], d).catch(() => null),
    getVitalsPages(range, id, d).catch(() => null),
    getVitalsTrend(range, id, d).catch(() => null),
  ]);
  const v = facts ? (facts.get(id) ?? emptyVitals()) : null;
  const base = `/projects/${id}`;
  const kept = range.key === "12m" ? " Speed data is kept 30 days, so this shows the last 30." : "";
  const slowest = [...(pages ?? [])].sort((a, b) => (b.lcp ?? -1) - (a.lcp ?? -1));

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Device" className="flex flex-wrap items-center gap-2 text-[13px]">
        {DEVICES.map((x) => (
          <Link
            key={x}
            href={hrefWith(base, params, { device: x === "all" ? undefined : x })}
            aria-current={x === device ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-3.5 ${x === device ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {DEVICE_TEXT[x]}
          </Link>
        ))}
        <span className="text-xs text-muted">Mobile: a narrow screen or a touch screen.</span>
      </nav>

      <div id="metrics" className="scroll-mt-6">
        {!v ? (
          <LoadFailed what="speed measures" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STORY_METRICS.map((m) => (
              <MetricCard key={m} metric={m} title={PLAIN_METRIC[m]} value={v[m].p75} samples={v[m].samples} />
            ))}
          </div>
        )}
        <Hint className="mt-2">
          Every value is the 75th percentile: 3 in 4 visits were this fast or faster. That is how Google rates sites. With fewer than 20 page loads a
          rating is only an early hint, and under 5 there is no rating at all.{kept}
        </Hint>
      </div>

      <Card id="pages" title="Slowest pages first" hint={kept.trim() || undefined}>
        {!pages ? (
          <LoadFailed what="pages" />
        ) : slowest.length === 0 ? (
          <Empty>No page loads measured yet. The Pulse script measures speed on every real visit; it shows up after the first one.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-normal">Page</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Loads measured</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Shows up</th>
                  <th scope="col" className="py-2 pr-3 font-normal">Reacts</th>
                  <th scope="col" className="py-2 font-normal">Stays still</th>
                </tr>
              </thead>
              <tbody>
                {slowest.map((p) => (
                  <tr key={p.path} className="border-b border-line/60">
                    <td className="max-w-64 truncate py-2.5 pr-3 font-mono">{p.path}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{formatCount(p.samples)}</td>
                    <td className="py-2.5 pr-3">
                      <MetricValue metric="lcp" value={p.lcp} samples={p.samples} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <MetricValue metric="inp" value={p.inp} samples={p.samples} />
                    </td>
                    <td className="py-2.5">
                      <MetricValue metric="cls" value={p.cls} samples={p.samples} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Hint className="mt-3">Colours: green good, amber needs work, red poor, using Google&apos;s limits. Grey: too few loads to judge.</Hint>
      </Card>

      <Card id="trend" title={`Speed per ${range.unit === "hour" ? "hour" : "day"}`} hint={`75th percentile of each measure.${kept}`}>
        {!trend ? <LoadFailed what="the trend" /> : <Trend rows={trend} range={range} deploys={deploys} />}
      </Card>
    </div>
  );
}

type TrendRow = Record<string, unknown>;

// One small line per measure, coloured by band, with deploy markers
function Trend({ rows, range, deploys }: { rows: TrendRow[]; range: Range; deploys: DeployMark[] }) {
  if (rows.length === 0) return <Empty>No page loads measured in this range yet.</Empty>;
  // Every bucket of the range (12 months: the last 30 days kept), so gaps show as gaps
  const keys = (range.key === "12m" ? resolveRange("30d", range.end, range.tz) : range).buckets.map((b) => b.key);
  const byKey = new Map(rows.map((r) => [String(r.bucket), r]));
  const first = keys[0];
  const last = keys[keys.length - 1];
  const label = (k: string) => (k.length > 10 ? `${dayLabel(k.slice(0, 10))} ${k.slice(11)}:00` : dayLabel(k));
  const bucketOfDate = (at: Date) =>
    range.unit === "hour" ? `${localDay(at, range.tz)}T${String(localHour(at, range.tz)).padStart(2, "0")}` : localDay(at, range.tz);
  const marks = deploys.map((dpl) => ({ ...dpl, i: keys.indexOf(bucketOfDate(dpl.at)) })).filter((m) => m.i >= 0);
  return (
    <div className="flex flex-col gap-4">
      {STORY_METRICS.map((m: Metric) => {
        const values = keys.map((k) => {
          const v = byKey.get(k)?.[m];
          return v === null || v === undefined ? null : Number(v);
        });
        const counts = keys.map((k) => Number(byKey.get(k)?.[`${m}N`] ?? 0));
        const max = Math.max(METRICS[m].poor, ...values.map((x) => x ?? 0));
        const w = Math.max(1, keys.length - 1);
        const y = (x: number) => 30 - (Math.min(x, max) / max) * 28;
        return (
          <div key={m}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">
                {PLAIN_METRIC[m]} <span className="font-mono text-muted">{METRICS[m].name}</span>
              </span>
              <span className="text-muted">good under {formatMetric(m, METRICS[m].good)}</span>
            </div>
            <svg viewBox={`0 0 ${w} 32`} preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={`${PLAIN_METRIC[m]} per ${range.unit}`}>
              <rect x="0" y={y(METRICS[m].good)} width={w} height={30 - y(METRICS[m].good)} className="fill-up-soft" />
              {marks.map((mk) => (
                <line key={`${mk.commit}-${mk.i}`} x1={mk.i} x2={mk.i} y1="0" y2="32" className="stroke-muted" strokeWidth={0.6} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
              ))}
              {values.map((x, i) =>
                x === null ? null : (
                  <circle key={keys[i]} cx={i} cy={y(x)} r={1} className={counts[i] < 5 ? "fill-muted" : rate(m, x) === "good" ? "fill-up" : rate(m, x) === "poor" ? "fill-down" : "fill-warn"} vectorEffect="non-scaling-stroke">
                    <title>{`${label(keys[i])}: ${formatMetric(m, x)} from ${counts[i]} ${counts[i] === 1 ? "load" : "loads"}`}</title>
                  </circle>
                ),
              )}
            </svg>
          </div>
        );
      })}
      <div className="flex justify-between font-mono text-xs text-muted">
        <span>{label(first)}</span>
        <span>{label(last)}</span>
      </div>
      {marks.length > 0 && <Hint>Dashed lines are deploys: {marks.map((mk) => mk.commit ?? "deploy").join(", ")}.</Hint>}
    </div>
  );
}
