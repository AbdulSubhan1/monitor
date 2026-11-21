import { Card, Empty, Hint, LoadFailed, MetricValue, ShareBar, StatCard, TextLink, TrafficChart } from "@/components/insight";
import type { ProjectFacts } from "@/lib/facts";
import { formatCount, formatPercent, timeAgo } from "@/lib/format";
import { isAutoEvent } from "@/lib/ingest";
import { readableName } from "@/lib/names";
import { dayLabel, type Range } from "@/lib/range";
import { projectHref } from "@/lib/stories";
import { localDay } from "@/lib/time";
import { formatMetric, shownRating } from "@/lib/vitals";
import type { Deploy } from "@/server/deploys";
import { getEventGroups, getVisitSummary } from "@/server/insights";

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60 ? `${s % 60} s` : ""}`.trim() : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function visitorsMeaning(f: ProjectFacts, range: Range, returning: number | null): string {
  if (!f.visitorsSince) return "One browser on one device. Starts after the update.";
  const since = f.visitorsSince > localDay(range.start, range.tz) ? ` Counted since ${dayLabel(f.visitorsSince)}.` : "";
  const back = returning ? ` ${formatCount(returning)} returning (seen on an earlier visit in the last 60 days).` : "";
  const how = range.key === "12m" ? "Added up by month: one browser counts once per month it came." : "One browser on one device, counted once however many pages or days.";
  return `${how}${back}${since}`;
}

// "Unknown" said in words, the ?ref= tag or referring site otherwise
export function sourceLabel(key: string): { name: string; note?: string } {
  return key ? { name: key } : { name: "Unknown", note: "Typed in, a bookmark, or a link that hides itself" };
}

export async function OverviewTab({ f, range, deploy }: { f: ProjectFacts; range: Range; deploy: Deploy | null }) {
  const [visits, groups] = await Promise.all([getVisitSummary(range, f.id).catch(() => null), getEventGroups(range, f.id).catch(() => null)]);
  const actions = (groups ?? []).filter((g) => !isAutoEvent(g.key)).sort((a, b) => b.events - a.events);
  const kinds = new Set(actions.map((a) => a.key)).size;
  const top = actions.slice(0, 5);
  const path = visits?.paths.paths[0];
  const twelve = range.key === "12m";
  const lcp = f.vitals.lcp;
  const lcpShown = shownRating("lcp", lcp.p75, lcp.samples);
  const sourcesMax = Math.max(1, ...f.sources.map((s) => s.views));

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={range.key === "12m" ? "Visitors (added up by month)" : "Visitors"}
          value={f.visitorsSince ? formatCount(f.visitors) : "—"}
          meaning={visitorsMeaning(f, range, f.returning)}
        />
        <StatCard label="Page views" value={formatCount(f.views)} meaning="Every page opened, refreshes too. Always higher than visitors." />
        <StatCard
          label="Events"
          value={formatCount(f.events)}
          meaning={
            <>
              Things people did: clicks, forms sent, payments. <TextLink href={projectHref(f.id, "events", range, "list")}>See them all</TextLink>
            </>
          }
        />
        <StatCard
          label="Avg time on site"
          value={visits ? formatDuration(visits.avgMs) : "—"}
          meaning={!visits ? "Couldn't load." : visits.avgMs === null ? "How long a visit lasts. Starts counting after the update." : `How long a visit lasts, visible time only${twelve ? ", last 60 days" : ""}.`}
        />
      </dl>

      <Card id="chart" title={`Visitors and page views per ${range.unit}`} hint={twelve ? "One bar per month. Visitors are added up by day." : undefined}>
        <TrafficChart points={f.buckets} range={range} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card id="paths" title="Most common path" hint={`Pulse finds this by itself from the order people open pages in. Nothing to set up.${twelve ? " Last 60 days." : ""}`}>
          {!visits ? (
            <LoadFailed what="visits" />
          ) : path ? (
            <>
              <ol className="flex flex-wrap items-center gap-2 text-[13px]">
                {path.steps.map((s, i) => (
                  <li key={`${s}-${i}`} className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 font-mono ${i === path.steps.length - 1 ? "bg-up-soft text-up-ink" : "bg-paper"}`}>{s}</span>
                    {i < path.steps.length - 1 && <span className="text-muted" aria-hidden>→</span>}
                  </li>
                ))}
              </ol>
              <Hint className="mt-3">
                {formatCount(path.visits)} {path.visits === 1 ? "visit" : "visits"} by {formatCount(path.visitors)} {path.visitors === 1 ? "visitor" : "visitors"}.{" "}
                <TextLink href={projectHref(f.id, "traffic", range, "paths")}>All paths</TextLink>
              </Hint>
            </>
          ) : (
            <Empty>No visit opened two pages yet{f.visitorsSince ? "" : " (paths start after the update)"}.</Empty>
          )}
        </Card>

        <Card id="actions" title="Top actions" aside={kinds > 5 ? <TextLink href={projectHref(f.id, "events", range, "list")}>{`All ${kinds} kinds`}</TextLink> : undefined} hint="The 5 events that happened most.">
          {!groups ? (
            <LoadFailed what="events" />
          ) : top.length ? (
            <ol className="flex flex-col gap-2.5">
              {top.map((a) => (
                <li key={`${a.key}·${a.label}`} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="truncate">
                    {readableName(a.key)}
                    {a.label && <span className="text-muted"> · {a.label}</span>}
                  </span>
                  <span className="text-right font-mono tabular-nums">{formatCount(a.events)}</span>
                  <span className="col-span-2">
                    <ShareBar value={a.events} max={top[0].events} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>
              No events yet. Add <span className="font-mono">data-pulse-event=&quot;signup_clicked&quot;</span> to a button and its clicks show here.{" "}
              <TextLink href="/guide#events">How to add one</TextLink>
            </Empty>
          )}
        </Card>

        <Card id="sources" title="Where visitors came from" hint="The site or link that sent them.">
          {f.sources.length ? (
            <ol className="flex flex-col gap-2.5 text-[13px]">
              {f.sources.slice(0, 5).map((s) => {
                const l = sourceLabel(s.key);
                return (
                  <li key={s.key || "unknown"} className="grid grid-cols-[minmax(0,1fr)_3rem] gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate">
                      {l.name}
                      {l.note && <span className="text-muted"> · {l.note}</span>}
                    </span>
                    <span className="text-right font-mono tabular-nums">{formatCount(s.views)}</span>
                    <span className="col-span-2">
                      <ShareBar value={s.views} max={sourcesMax} />
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty>No page views in this range.</Empty>
          )}
        </Card>

        <Card id="health" title="Health">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 text-[13px]">
            <dt className="text-muted">Uptime{range.key === "12m" ? " (last 30 days)" : ""}</dt>
            <dd className="font-mono tabular-nums">{formatPercent(f.status.uptime)}</dd>
            <dt className="text-muted">Response time</dt>
            <dd className="font-mono tabular-nums">{f.status.avgMs === null ? "—" : `${formatCount(f.status.avgMs)} ms`}</dd>
            <dt className="text-muted">Errors</dt>
            <dd className={`font-mono tabular-nums ${f.errors ? "text-down-ink" : ""}`}>{formatCount(f.errors)}</dd>
            <dt className="text-muted">Page load (LCP)</dt>
            <dd className="text-right">
              {lcp.p75 === null ? (
                <span className="text-muted">No loads measured</span>
              ) : (
                <>
                  <MetricValue metric="lcp" value={lcp.p75} samples={lcp.samples} />{" "}
                  <span className="text-xs text-muted">
                    {lcpShown.confidence === "few" ? "too few loads" : lcpShown.confidence === "hint" ? "early hint" : lcpShown.rating === "good" ? "good" : lcpShown.rating === "poor" ? "slow" : "needs work"}
                  </span>
                </>
              )}
            </dd>
          </dl>
          <Hint className="mt-3">
            {deploy ? `Last deploy ${timeAgo(deploy.at)}${deploy.commit ? ` (${deploy.commit})` : ""}.` : "Last deploy unknown."}{" "}
            {lcp.p75 !== null && lcpShown.rating !== "good" && (
              <TextLink href={projectHref(f.id, "performance", range, "metrics")}>{`Why it's ${formatMetric("lcp", lcp.p75)}`}</TextLink>
            )}
          </Hint>
        </Card>
      </div>
    </div>
  );
}
