import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DayBars, UptimeStrip } from "@/components/charts";
import { Stat, StatusPill } from "@/components/status";
import { formatCount, formatPercent, timeAgo } from "@/lib/format";
import { findProject } from "@/lib/projects";
import { toSlots } from "@/lib/slots";
import { getDeploy } from "@/server/deploys";
import { getChecks24h, getDailyViews, getSummaries, getTop, lastSevenDays } from "@/server/queries";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: findProject(id)?.name ?? "Not found" };
}

function TopList({ title, rows, empty }: { title: string; rows: { label: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-xl border border-line bg-card p-4 md:p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="relative flex justify-between gap-3 rounded px-2 py-1 text-sm">
              {/* Background bar sized by share of the top row */}
              <svg className="absolute inset-0 -z-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 1" aria-hidden>
                <rect width={(r.count / max) * 100} height={1} className="fill-bar-soft" />
              </svg>
              <span className="relative truncate font-mono text-xs leading-5">{r.label}</span>
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

  const [summaries, checks, daily, top, deploy] = await Promise.all([
    getSummaries(),
    getChecks24h(project.id),
    getDailyViews(project.id),
    getTop(project.id),
    getDeploy(project),
  ]);
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
        <TopList title="Events, 7 days" rows={top.named} empty="No events yet." />
        <TopList title="Referring sites, 7 days" rows={top.referrers} empty="No referrers yet." />
      </div>

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
