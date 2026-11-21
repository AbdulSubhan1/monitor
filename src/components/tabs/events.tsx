import { Card, Empty, LoadFailed, ShareBar, TextLink } from "@/components/insight";
import { formatDuration } from "@/components/tabs/overview";
import type { ProjectFacts } from "@/lib/facts";
import { formatCount } from "@/lib/format";
import { AUTO_EVENTS, isAutoEvent, type AutoEvent } from "@/lib/ingest";
import { readableName } from "@/lib/names";
import { dayLabel, type Range } from "@/lib/range";
import { localClock, localDay } from "@/lib/time";
import { getEventGroups, getFeed } from "@/server/insights";

const AUTO_HELP: Record<AutoEvent, string> = {
  scroll_depth: "25%, 50%, 75% and 100% of each page",
  section_viewed: "Which parts of a long page came on screen",
  outbound_clicked: "Every outside link, with the site it goes to",
  file_downloaded: "PDF, ZIP and other files, by name",
  time_on_page: "Only while the tab is in front",
};

function feedTime(at: Date, prev: Date | null, tz: string): string {
  const day = localDay(at, tz);
  return !prev || localDay(prev, tz) !== day ? `${dayLabel(day)} ${localClock(at, tz)}` : localClock(at, tz);
}

export async function EventsTab({ f, range }: { f: ProjectFacts; range: Range }) {
  const [groups, feed] = await Promise.all([getEventGroups(range, f.id).catch(() => null), getFeed(f.id).catch(() => null)]);
  const tagged = (groups ?? []).filter((g) => !isAutoEvent(g.key));
  const byName = new Map<string, { total: number; labels: { label: string; count: number }[] }>();
  for (const g of tagged) {
    const e = byName.get(g.key) ?? { total: 0, labels: [] };
    e.total += g.events;
    if (g.label) e.labels.push({ label: g.label, count: g.events });
    byName.set(g.key, e);
  }
  const names = [...byName].sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...names.map(([, e]) => e.total));
  const auto = (groups ?? []).filter((g) => isAutoEvent(g.key));

  return (
    <div className="flex flex-col gap-5">
      <Card id="list" title="Events you added" aside="Open a row to see what was clicked">
        {!groups ? (
          <LoadFailed what="events" />
        ) : names.length === 0 ? (
          <Empty>
            No events in this range. Add <span className="font-mono">data-pulse-event=&quot;signup_clicked&quot;</span> to a button, or call{" "}
            <span className="font-mono">pulse.track(&quot;signup_clicked&quot;)</span>. <TextLink href="/guide#events">How to add one</TextLink>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {names.map(([name, e]) => (
              <li key={name}>
                <details className="group">
                  <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(4rem,10rem)_3rem] items-center gap-3 py-1.5 text-[13px] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block truncate">
                        <span className="mr-1 inline-block text-muted transition-transform group-open:rotate-90" aria-hidden>
                          ›
                        </span>
                        {readableName(name)}
                      </span>
                      <span className="block truncate pl-3 font-mono text-[11px] text-muted">{name}</span>
                    </span>
                    <ShareBar value={e.total} max={max} />
                    <span className="text-right font-mono tabular-nums">{formatCount(e.total)}</span>
                  </summary>
                  <ul className="mb-2 ml-3 flex flex-col gap-1 text-xs">
                    {e.labels.length ? (
                      e.labels
                        .sort((a, b) => b.count - a.count)
                        .map((l) => (
                          <li key={l.label} className="flex justify-between gap-3">
                            <span className="truncate text-muted-ink">{l.label}</span>
                            <span className="font-mono tabular-nums">{formatCount(l.count)}</span>
                          </li>
                        ))
                    ) : (
                      <li className="text-muted">No labels: every click was the same.</li>
                    )}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card id="feed" title="Live feed" hint="Newest first. Do something on the site and it appears here within seconds. Page views show too, so you can follow one visit from start to end.">
        {!feed ? (
          <LoadFailed what="the live feed" />
        ) : feed.length === 0 ? (
          <Empty>Nothing yet. Open the site and the first page view shows up here.</Empty>
        ) : (
          <ol className="flex flex-col gap-1.5 text-[13px]">
            {feed.map((row, i) => {
              const what = row.type === "pageview" ? "Page opened" : readableName(row.name);
              const from = row.type === "pageview" && (row.source || row.referrer);
              return (
                <li key={`${row.at.getTime()}-${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                  <span className="font-mono text-xs text-muted tabular-nums">{feedTime(row.at, i ? feed[i - 1].at : null, range.tz)}</span>
                  <span className="min-w-0 truncate">
                    {what}
                    {row.label && <span className="text-muted"> · {row.label}</span>}
                    <span className="font-mono text-xs text-muted"> · {row.path}</span>
                    {from && <span className="text-muted"> · from {from}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card id="auto" title="Tracked automatically" aside="Every site, no code" hint="The Pulse script records these on every project by itself.">
        <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {AUTO_EVENTS.map((name) => {
            const rows = auto.filter((a) => a.key === name).sort((a, b) => b.events - a.events);
            const total = rows.reduce((s, r) => s + r.events, 0);
            const ms = rows.reduce((s, r) => s + r.valueSum, 0);
            return (
              <li key={name} className="text-[13px]">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{readableName(name)}</span>
                  {total > 0 && <span className="font-mono tabular-nums">{formatCount(total)}</span>}
                </div>
                <p className="text-xs text-muted">{AUTO_HELP[name]}</p>
                {!groups ? null : total === 0 ? (
                  <p className="mt-1 text-xs text-muted">Starts after the update.</p>
                ) : name === "time_on_page" ? (
                  <p className="mt-1 text-xs">
                    {formatDuration(ms)} in all, about {formatDuration(ms / total)} per page view
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                    {(name === "scroll_depth" ? [...rows].sort((a, b) => Number(a.label) - Number(b.label)) : rows.slice(0, 5)).map((r) => (
                      <li key={r.label} className="flex justify-between gap-3">
                        <span className="truncate text-muted-ink">{name === "scroll_depth" ? `Reached ${r.label}%` : r.label}</span>
                        <span className="font-mono tabular-nums">{formatCount(r.events)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          <li className="text-[13px]">
            <span className="font-medium">Every kind of click</span>
            <p className="text-xs text-muted">Also middle-click and Ctrl/Cmd+click. A long-press “open in new tab” on a phone can&apos;t be seen by any site.</p>
          </li>
        </ul>
      </Card>
    </div>
  );
}
