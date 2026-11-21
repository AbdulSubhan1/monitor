import Link from "next/link";
import { Card, Empty, Hint, LoadFailed, ShareBar } from "@/components/insight";
import { hrefWith } from "@/components/range-picker";
import { sourceLabel } from "@/components/tabs/overview";
import type { ProjectFacts } from "@/lib/facts";
import { formatCount } from "@/lib/format";
import { findProject } from "@/lib/projects";
import type { Range } from "@/lib/range";
import { T } from "@/lib/stories";
import { getPages, getVisitSummary } from "@/server/insights";

export const SORTS = ["views", "visitors", "exits", "path"] as const;
export type Sort = (typeof SORTS)[number];

export function parseSort(raw: string | string[] | undefined): Sort {
  return typeof raw === "string" && (SORTS as readonly string[]).includes(raw) ? (raw as Sort) : "views";
}

const HEADERS: [Sort, string][] = [
  ["path", "Page"],
  ["views", "Page views"],
  ["visitors", "Visitors"],
];

export async function TrafficTab({ f, range, sort, params }: { f: ProjectFacts; range: Range; sort: Sort; params: Record<string, string | undefined> }) {
  const [pages, visits] = await Promise.all([getPages(range, f.id).catch(() => null), getVisitSummary(range, f.id).catch(() => null)]);
  const twelve = range.key === "12m";
  const rows = [...(pages?.rows ?? [])].sort((a, b) => (sort === "path" ? a.path.localeCompare(b.path) : b[sort] - a[sort] || b.views - a.views));
  const total = rows.reduce((s, r) => s + r.views, 0);
  const max = Math.max(1, ...rows.map((r) => r.views));
  const unknownShare = f.views ? f.unknownViews / f.views : 0;
  const url = findProject(f.id)!.url;
  const base = `/projects/${f.id}`;
  const sortLink = (s: Sort) => `${hrefWith(base, params, { sort: s === "views" ? undefined : s })}#pages`;

  return (
    <div className="flex flex-col gap-5">
      <Card id="pages" title="Pages" aside="Click a header to sort">
        {!pages ? (
          <LoadFailed what="pages" />
        ) : rows.length === 0 ? (
          <Empty>No page views in this range. Nobody opened the site, or the Pulse script is missing.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  {HEADERS.map(([key, text]) => (
                    <th key={key} scope="col" className="py-2 pr-3 font-normal" aria-sort={sort === key ? (key === "path" ? "ascending" : "descending") : undefined}>
                      <Link href={sortLink(key)} className={`inline-flex min-h-8 items-center hover:text-ink ${sort === key ? "font-medium text-ink" : ""}`}>
                        {text}
                        {sort === key && " ↓"}
                      </Link>
                    </th>
                  ))}
                  <th scope="col" className="py-2 pr-3 font-normal">
                    Share of views
                  </th>
                  <th scope="col" className="py-2 font-normal" aria-sort={sort === "exits" ? "descending" : undefined}>
                    <Link href={sortLink("exits")} className={`inline-flex min-h-8 items-center hover:text-ink ${sort === "exits" ? "font-medium text-ink" : ""}`}>
                      People left from here{sort === "exits" && " ↓"}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((r) => (
                  <tr key={r.path} className="border-b border-line/60">
                    <td className="max-w-64 truncate py-2.5 pr-3 font-mono">{r.path}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{formatCount(r.views)}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{f.visitorsSince ? formatCount(r.visitors) : "—"}</td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="w-28 sm:w-40">
                          <ShareBar value={r.views} max={max} />
                        </span>
                        <span className="font-mono text-xs text-muted">{Math.round((r.views / total) * 100)}%</span>
                      </span>
                    </td>
                    <td className="py-2.5 font-mono tabular-nums">{f.visitorsSince ? formatCount(r.exits) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Hint className="mt-3">
          “People left from here” is the last page of a visit. A high number on a form page means people gave up there.
          {twelve && " Visits and exits use the last 60 days."}
          {!f.visitorsSince && " Visitors and exits start counting after the update."}
        </Hint>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="sources" title="Where visitors came from" hint={<>The site that linked here, or the <span className="font-mono">?ref=</span> tag on the link.</>}>
          {f.sources.length === 0 ? (
            <Empty>No page views in this range.</Empty>
          ) : (
            <ol className="flex flex-col gap-3 text-[13px]">
              {f.sources.slice(0, 15).map((s) => {
                const l = sourceLabel(s.key);
                return (
                  <li key={s.key || "unknown"} className="grid grid-cols-[minmax(0,1fr)_3rem] gap-2.5">
                    <span className="min-w-0">
                      <span className="block truncate">{l.name}</span>
                      {l.note && <span className="block text-xs text-muted">{l.note}</span>}
                    </span>
                    <span className="text-right font-mono tabular-nums">{formatCount(s.views)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {unknownShare >= T.unknownShare && f.views >= T.unknownMinViews && (
          <section id="fix" className="scroll-mt-6 rounded-xl border border-warn/50 bg-warn-soft p-4 text-warn-ink md:px-6 md:py-5">
            <h2 className="mb-2 text-[15px] font-semibold">Why so much is “Unknown”</h2>
            <p className="mb-2.5 text-[13px] leading-relaxed">
              {Math.round(unknownShare * 100)}% of page views came without a known source. Either people typed the address, or the link that sent them uses{" "}
              <span className="font-mono">rel=&quot;noreferrer&quot;</span> (or sits in an app like WhatsApp), which tells the browser not to say where it came from.
            </p>
            <p className="mb-1.5 text-[13px] font-semibold">Fix it once, on the site that links:</p>
            <pre className="overflow-x-auto rounded-lg bg-card p-3 font-mono text-xs text-ink">{`<a href="${url}?ref=portfolio"\n   rel="noopener">Live demo</a>`}</pre>
            <p className="mt-2.5 text-xs leading-relaxed">
              Pulse then shows “portfolio” here. Works for any link you share: LinkedIn posts, your CV, WhatsApp. Use any short name after <span className="font-mono">?ref=</span>.
            </p>
          </section>
        )}
      </div>

      <Card id="paths" title="Common paths" hint={`The orders people open pages in, found by Pulse. The top 3 paths.${twelve ? " Last 60 days." : ""}`}>
        {!visits ? (
          <LoadFailed what="visits" />
        ) : visits.paths.paths.length === 0 ? (
          <Empty>No visit opened two pages yet{f.visitorsSince ? "" : " (paths start after the update)"}.</Empty>
        ) : (
          <ol className="flex flex-col gap-3">
            {visits.paths.paths.map((p) => (
              <li key={p.steps.join(">")} className="flex flex-wrap items-center gap-2 text-[13px]">
                {p.steps.map((s, i) => (
                  <span key={`${s}-${i}`} className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 font-mono ${i === p.steps.length - 1 ? "bg-up-soft text-up-ink" : "bg-paper"}`}>{s}</span>
                    {i < p.steps.length - 1 && <span className="text-muted" aria-hidden>→</span>}
                  </span>
                ))}
                <span className="ml-auto font-mono tabular-nums">
                  {formatCount(p.visits)} {p.visits === 1 ? "visit" : "visits"}
                </span>
              </li>
            ))}
          </ol>
        )}
        {visits?.paths.bySections && <Hint className="mt-3">This is a one-page site, so these are the sections people scrolled through, in order.</Hint>}
      </Card>
    </div>
  );
}
