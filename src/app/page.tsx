import Link from "next/link";
import { connection } from "next/server";
import { DayBars } from "@/components/charts";
import { Stat, StatusPill } from "@/components/status";
import { VitalsLine } from "@/components/vitals";
import { formatCount, formatPercent, timeAgo } from "@/lib/format";
import { findProject, PROJECTS } from "@/lib/projects";
import { getDeploy } from "@/server/deploys";
import { getApiSummaries, getDailyViews, getSecurity, getSummaries, getVitals, lastSevenDays } from "@/server/queries";

export default async function OverviewPage() {
  await connection();
  const [summaries, daily, vitals, api, security, deploys] = await Promise.all([
    getSummaries(),
    getDailyViews(),
    getVitals(),
    getApiSummaries(),
    getSecurity(),
    Promise.all(PROJECTS.map(getDeploy)),
  ]);
  const days = lastSevenDays();
  const checked = PROJECTS.filter((p) => summaries.get(p.id)?.lastCheck);
  const down = checked.filter((p) => !summaries.get(p.id)!.lastCheck!.ok);
  const criticalAlerts = security.alerts.some((a) => a.severity === "critical");

  return (
    <>
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold md:text-3xl">
          {checked.length === 0
            ? "Waiting for the first check"
            : down.length === 0
              ? "All projects are up"
              : `${down.map((p) => p.name).join(", ")} ${down.length === 1 ? "is" : "are"} down`}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {PROJECTS.length} live projects, checked every 10 minutes. Traffic, clicks and speed come from a cookie-free beacon on
          each site; API calls and errors from each app&apos;s server.
        </p>
      </div>

      {security.alerts.length > 0 && (
        // Public page: counts and project names only; the details are behind the logs password
        <Link
          href="/logs/security"
          className={`mb-6 block rounded-xl border p-4 text-sm ${criticalAlerts ? "border-down bg-down-soft text-down" : "border-warn bg-warn-soft text-warn"}`}
        >
          <span className="font-semibold">
            {security.alerts.length} security {security.alerts.length === 1 ? "alert" : "alerts"} in the last 24 hours
          </span>{" "}
          on {[...new Set(security.alerts.map((a) => (a.project === "pulse" ? "Pulse" : (findProject(a.project)?.name ?? a.project))))].join(", ")}.
          See details →
        </Link>
      )}

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((project, i) => {
          const s = summaries.get(project.id);
          const deploy = deploys[i];
          const apiStat = api.get(project.id);
          const bars = days.map((day) => ({
            label: day,
            value: daily.find((d) => d.project === project.id && d.day === day)?.views ?? 0,
          }));
          return (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="block h-full rounded-xl border border-line bg-card p-4 transition-colors hover:border-muted md:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{project.name}</h2>
                    <p className="truncate text-xs text-muted">{project.url.replace("https://", "")}</p>
                  </div>
                  <StatusPill state={s?.lastCheck ? (s.lastCheck.ok ? "up" : "down") : "unknown"} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3">
                  <Stat label="Uptime 24 h" value={formatPercent(s?.uptime24h ?? null)} />
                  <Stat label="Views 24 h" value={formatCount(s?.views24h ?? 0)} />
                  <Stat label="Errors 24 h" value={formatCount(s?.errors24h ?? 0)} tone={s?.errors24h ? "down" : undefined} />
                </dl>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>Views, 7 days</span>
                    <span className="font-mono tabular-nums">{formatCount(s?.views7d ?? 0)}</span>
                  </div>
                  <DayBars bars={bars} />
                </div>

                <div className="mt-4 space-y-1 text-xs">
                  <VitalsLine values={vitals.get(project.id)} />
                  {apiStat && (
                    <p>
                      <span className="text-muted">API 24 h </span>
                      <span className="font-mono tabular-nums">{formatCount(apiStat.calls)} calls</span>
                      {apiStat.failed > 0 && <span className="text-down"> · {formatCount(apiStat.failed)} failed</span>}
                      {apiStat.p95 !== null && <span className="text-muted"> · p95 {Math.round(apiStat.p95)} ms</span>}
                    </p>
                  )}
                </div>

                <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                  {deploy ? (
                    <>
                      Deployed {timeAgo(deploy.at)}
                      {deploy.commit && <span className="font-mono"> · {deploy.commit}</span>}
                      {deploy.state !== "ready" && deploy.state !== "success" && ` · ${deploy.state}`}
                    </>
                  ) : (
                    "Last deploy unknown"
                  )}
                  {s?.lastCheck && <> · checked {timeAgo(s.lastCheck.at)}</>}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
