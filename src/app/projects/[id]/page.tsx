import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DayBars, UptimeStrip } from "@/components/charts";
import { Stat, StatusPill } from "@/components/status";
import { MetricCell, VitalsTiles } from "@/components/vitals";
import { formatCount, formatPercent, timeAgo } from "@/lib/format";
import { findProject } from "@/lib/projects";
import { toSlots } from "@/lib/slots";
import { getDeploy } from "@/server/deploys";
import {
  getApiRoutes,
  getChecks24h,
  getDailyViews,
  getSummaries,
  getTop,
  getVitals,
  getVitalsByPage,
  lastSevenDays,
} from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: findProject(id)?.name ?? "Not found" };
}

type TopRow = { label: string; detail?: string | null; count: number };

function TopList({ title, rows, empty }: { title: string; rows: TopRow[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-xl border border-line bg-card p-4 md:p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={`${r.label}·${r.detail ?? ""}`} className="relative flex justify-between gap-3 rounded px-2 py-1 text-sm">
              {/* Background bar sized by share of the top row */}
              <svg className="absolute inset-0 -z-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 1" aria-hidden>
                <rect width={(r.count / max) * 100} height={1} className="fill-bar-soft" />
              </svg>
              <span className="relative min-w-0 truncate text-xs leading-5">
                <span className="font-mono">{r.label}</span>
                {r.detail && <span className="text-muted"> · {r.detail}</span>}
              </span>
              <span className="relative font-mono text-xs tabular-nums leading-5">{formatCount(r.count)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const project = findProject(id);
  if (!project) notFound();
  await connection();

  const [summaries, checks, daily, top, vitals, pageVitals, routes, deploy] = await Promise.all([
    getSummaries(),
    getChecks24h(project.id),
    getDailyViews(project.id),
    getTop(project.id),
    getVitals(),
    getVitalsByPage(project.id),
    getApiRoutes(project.id),
    getDeploy(project),
  ]);
  const v = vitals.get(project.id);
  const s = summaries.get(project.id);
  const bars = lastSevenDays().map((day) => ({ label: day, value: daily.find((d) => d.day === day)?.views ?? 0 }));
  const failures = checks.filter((c) => !c.ok);

  return (
    <>
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← All projects
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">{project.name}</h1>
        <StatusPill state={s?.lastCheck ? (s.lastCheck.ok ? "up" : "down") : "unknown"} />
        <a href={project.url} className="text-sm text-muted underline hover:text-ink">
          {project.url.replace("https://", "")}
        </a>
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-line bg-card p-4 md:grid-cols-6 md:p-5">
        <Stat label="Uptime 24 h" value={formatPercent(s?.uptime24h ?? null)} />
        <Stat label="Avg response" value={s?.avgMs24h ? `${s.avgMs24h} ms` : "–"} />
        <Stat label="Views 24 h" value={formatCount(s?.views24h ?? 0)} />
        <Stat label="Views 7 days" value={formatCount(s?.views7d ?? 0)} />
        <Stat label="Events 24 h" value={formatCount(s?.events24h ?? 0)} />
        <Stat label="Errors 24 h" value={formatCount(s?.errors24h ?? 0)} tone={s?.errors24h ? "down" : undefined} />
      </dl>

      <section className="mb-6 rounded-xl border border-line bg-card p-4 md:p-5">
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
          <h2 className="font-semibold">Uptime, last 24 hours</h2>
          <span className="text-muted">
            {checks.length} checks of <span className="font-mono">{project.checkPath}</span>
            {failures.length > 0 && <span className="text-down"> · {failures.length} failed</span>}
          </span>
        </div>
        <UptimeStrip slots={toSlots(checks)} />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>24 h ago</span>
          <span>now</span>
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-line bg-card p-4 md:p-5">
        <h2 className="mb-2 text-sm font-semibold">Page views per day</h2>
        <DayBars bars={bars} height={60} />
        <div className="mt-1 flex justify-between font-mono text-xs text-muted">
          <span>{bars[0].label}</span>
          <span>{bars[bars.length - 1].label}</span>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <TopList title="Top pages, 7 days" rows={top.pages} empty="No page views yet." />
        <TopList title="Clicks and events, 7 days" rows={top.named} empty="No events yet." />
        <TopList title="Referring sites, 7 days" rows={top.referrers} empty="No referrers yet." />
      </div>

      <section className="mt-6 rounded-xl border border-line bg-card p-4 md:p-5">
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
          <h2 className="font-semibold">Performance, 7 days</h2>
          <span className="text-muted">
            75th percentile of {formatCount(v?.samples ?? 0)} real page loads (Core Web Vitals)
          </span>
        </div>
        {v ? (
          <>
            <VitalsTiles values={v} />
            {pageVitals.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 pr-3 font-normal">Page</th>
                      <th className="py-1 pr-3 font-normal">Loads</th>
                      <th className="py-1 pr-3 font-normal">LCP</th>
                      <th className="py-1 pr-3 font-normal">INP</th>
                      <th className="py-1 font-normal">CLS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {pageVitals.map((p) => (
                      <tr key={p.path}>
                        <td className="max-w-48 truncate py-1.5 pr-3 font-mono">{p.path}</td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums">{formatCount(p.samples)}</td>
                        <td className="py-1.5 pr-3">
                          <MetricCell metric="lcp" value={p.lcp} />
                        </td>
                        <td className="py-1.5 pr-3">
                          <MetricCell metric="inp" value={p.inp} />
                        </td>
                        <td className="py-1.5">
                          <MetricCell metric="cls" value={p.cls} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">No page loads measured yet.</p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-card p-4 md:p-5">
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
          <h2 className="font-semibold">API calls, 7 days</h2>
          <Link href={`/logs/api?project=${project.id}`} className="text-muted underline hover:text-ink">
            Every call
          </Link>
        </div>
        {routes.length === 0 ? (
          <p className="text-sm text-muted">No API calls reported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-normal">Route</th>
                  <th className="py-1 pr-3 font-normal">Calls</th>
                  <th className="py-1 pr-3 font-normal">Failed</th>
                  <th className="py-1 pr-3 font-normal">4xx</th>
                  <th className="py-1 pr-3 font-normal">Avg</th>
                  <th className="py-1 font-normal">p95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {routes.map((r) => (
                  <tr key={`${r.method} ${r.host} ${r.route}`}>
                    <td className="py-1.5 pr-3 font-mono">
                      <span className="text-muted">{r.method} </span>
                      {r.route}
                      {r.host && <span className="block text-[11px] text-muted">{r.host}</span>}
                    </td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{formatCount(r.calls)}</td>
                    <td className={`py-1.5 pr-3 font-mono tabular-nums ${r.failed ? "text-down" : ""}`}>{formatCount(r.failed)}</td>
                    <td className={`py-1.5 pr-3 font-mono tabular-nums ${r.clientErrors ? "text-warn" : ""}`}>
                      {formatCount(r.clientErrors)}
                    </td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{r.avg} ms</td>
                    <td className="py-1.5 font-mono tabular-nums">{r.p95} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-sm text-muted">
        {deploy
          ? `Last production deploy ${timeAgo(deploy.at)}${deploy.commit ? ` (${deploy.commit}${deploy.message ? `: ${deploy.message}` : ""})` : ""}.`
          : "Last deploy unknown."}{" "}
        <Link href={`/logs?project=${project.id}`} className="underline hover:text-ink">
          See this project&apos;s logs
        </Link>
      </p>
    </>
  );
}
