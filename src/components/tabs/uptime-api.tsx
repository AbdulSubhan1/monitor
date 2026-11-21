import Link from "next/link";
import { UptimeStrip } from "@/components/charts";
import { Card, Empty, Hint, LoadFailed } from "@/components/insight";
import { formatCount, formatPercent } from "@/lib/format";
import type { Project } from "@/lib/projects";
import { dayLabel, resolveRange, type Range } from "@/lib/range";
import { localClock, localDay } from "@/lib/time";
import { toSlots, uptimeBars } from "@/lib/slots";
import { getApiRoutes, getChecks } from "@/server/insights";

// Every hour of the 7-day range, in the viewer's timezone
function hourBuckets(range: Range): { start: Date; label: string }[] {
  const out: { start: Date; label: string }[] = [];
  for (let t = range.start.getTime(); t <= range.end.getTime(); t += 3_600_000) {
    const start = new Date(t);
    out.push({ start, label: `${dayLabel(localDay(start, range.tz))} ${localClock(start, range.tz)}` });
  }
  return out;
}

export async function UptimeTab({ project, range }: { project: Project; range: Range }) {
  const checks = await getChecks(range, project.id).catch(() => null);
  if (!checks) return <LoadFailed what="the uptime checks" />;
  const failures = checks.filter((c) => !c.ok);
  const up = checks.length ? checks.filter((c) => c.ok).length / checks.length : null;
  const unit = range.key === "24h" ? "check" : range.key === "7d" ? "hour" : "day";
  const bars = unit === "check" ? null : uptimeBars(checks, unit === "hour" ? hourBuckets(range) : resolveRange("30d", range.end, range.tz).buckets);
  const kept = range.key === "12m" ? "Checks are kept 30 days, so this shows the last 30. " : "";

  return (
    <div className="flex flex-col gap-5">
      <Card
        id="checks"
        title={`Uptime, ${range.key === "24h" ? "last 24 hours" : range.key === "7d" ? "last 7 days" : "last 30 days"}`}
        aside={
          <>
            {formatCount(checks.length)} checks of <span className="font-mono">{project.checkPath}</span> · {formatPercent(up)} up
            {failures.length > 0 && <span className="text-down-ink"> · {formatCount(failures.length)} failed</span>}
          </>
        }
        hint={`${kept}One bar per ${unit}; grey where no check ran. Hover a bar for details.`}
      >
        {checks.length === 0 ? (
          <Empty>No checks yet. They run every 10 minutes once the schedule is set up.</Empty>
        ) : bars ? (
          <svg viewBox={`0 0 ${bars.length * 3} 24`} className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label={`Uptime per ${unit}`}>
            {bars.map((b, i) => (
              <rect
                key={i}
                x={i * 3}
                y={0}
                width={2.2}
                height={24}
                rx={0.6}
                className={b === null ? "fill-line" : b.ok === b.total ? "fill-up" : b.ok === 0 ? "fill-down" : "fill-warn"}
              >
                {b && <title>{b.label}</title>}
              </rect>
            ))}
          </svg>
        ) : (
          <UptimeStrip slots={toSlots(checks, range.end.getTime(), (d) => localClock(d, range.tz))} />
        )}
      </Card>

      <Card title="Failed checks" hint="Newest first. A failure is no answer, a timeout, or HTTP 400 and above.">
        {failures.length === 0 ? (
          <Empty>No failed checks in this range.</Empty>
        ) : (
          <ol className="flex flex-col gap-1.5 text-[13px]">
            {failures
              .slice(-30)
              .reverse()
              .map((c) => (
                <li key={c.at.getTime()} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3">
                  <span className="font-mono text-xs text-muted">
                    {dayLabel(localDay(c.at, range.tz))} {localClock(c.at, range.tz)}
                  </span>
                  <span className="truncate">{c.error ?? `HTTP ${c.status}`}</span>
                </li>
              ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

export async function ApiTab({ project, range }: { project: Project; range: Range }) {
  const routes = await getApiRoutes(range, project.id).catch(() => null);
  const kept = range.key === "12m" ? "API calls are kept 30 days, so this shows the last 30." : undefined;
  return (
    <Card id="routes" title="API calls by route" aside={<Link href={`/logs/api?project=${project.id}`} className="underline hover:text-ink">Every call</Link>} hint={kept}>
      {!routes ? (
        <LoadFailed what="API calls" />
      ) : routes.length === 0 ? (
        <Empty>
          No API calls reported. The app&apos;s server sends each call (method, route, status, time) to <span className="font-mono">/api/calls</span> with its
          project token; see the README, “Report API calls”.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-normal">Route</th>
                <th scope="col" className="py-2 pr-3 font-normal">Calls</th>
                <th scope="col" className="py-2 pr-3 font-normal">Failed</th>
                <th scope="col" className="py-2 pr-3 font-normal">4xx</th>
                <th scope="col" className="py-2 pr-3 font-normal">Avg</th>
                <th scope="col" className="py-2 font-normal">Slowest 1 in 20</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={`${r.method} ${r.host} ${r.route}`} className="border-b border-line/60">
                  <td className="py-2.5 pr-3 font-mono">
                    <span className="text-muted">{r.method} </span>
                    {r.route}
                    {r.host && <span className="block text-[11px] text-muted">{r.host}</span>}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{formatCount(r.calls)}</td>
                  <td className={`py-2.5 pr-3 font-mono tabular-nums ${r.failed ? "text-down-ink" : ""}`}>{formatCount(r.failed)}</td>
                  <td className={`py-2.5 pr-3 font-mono tabular-nums ${r.clientErrors ? "text-warn-ink" : ""}`}>{formatCount(r.clientErrors)}</td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums">{r.avg} ms</td>
                  <td className="py-2.5 font-mono tabular-nums">{r.p95} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint className="mt-3">Failed: no answer or a 5xx error. 4xx: the caller&apos;s mistake, counted apart.</Hint>
        </div>
      )}
    </Card>
  );
}
