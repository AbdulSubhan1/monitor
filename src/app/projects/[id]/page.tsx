import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { toSlides } from "@/components/insight";
import { hrefWith, RangePicker } from "@/components/range-picker";
import { StorySlider } from "@/components/story-slider";
import { TimezoneControl, viewerTz } from "@/components/timezone";
import { EventsTab } from "@/components/tabs/events";
import { OverviewTab } from "@/components/tabs/overview";
import { parseDevice, PerformanceTab } from "@/components/tabs/performance";
import { parseSort, TrafficTab } from "@/components/tabs/traffic";
import { ApiTab, UptimeTab } from "@/components/tabs/uptime-api";
import { formatPercent } from "@/lib/format";
import { findProject } from "@/lib/projects";
import { parseRange, RANGE_PHRASE, resolveRange } from "@/lib/range";
import { buildStories, storiesFor, type Tab } from "@/lib/stories";
import { getDeploy } from "@/server/deploys";
import { getFacts } from "@/server/insights";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: findProject(id)?.name ?? "Not found" };
}

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["traffic", "Traffic"],
  ["events", "Events"],
  ["performance", "Performance"],
  ["uptime", "Uptime"],
  ["api", "API calls"],
];

function parseTab(raw: string | string[] | undefined): Tab {
  return TABS.find(([t]) => t === raw)?.[0] ?? "overview";
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const project = findProject(id);
  if (!project) notFound();
  await connection();
  const sp = await searchParams;
  const { tz, hasCookie } = await viewerTz(sp.tz);
  const range = resolveRange(parseRange(sp.range), new Date(), tz);
  const tab = parseTab(sp.tab);
  const keep = { range: range.key, tab, sort: one(sp.sort), device: one(sp.device) };
  const base = `/projects/${id}`;

  const [all, deploy] = await Promise.all([getFacts(range, [id]).catch(() => null), getDeploy(project)]);
  const f = all?.get(id);
  const stories = f ? storiesFor(buildStories([f], { range, scope: { kind: "project", id } }), tab) : [];
  const state = !f || f.status.downNow === null ? "unknown" : f.status.downNow ? "down" : "up";
  const tabLabel = TABS.find(([t]) => t === tab)![1];

  return (
    <div className="flex flex-col gap-5">
      <Link href={range.key === "7d" ? "/" : `/?range=${range.key}`} className="text-sm text-muted hover:text-ink">
        ← All projects
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold md:text-3xl">{project.name}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${state === "up" ? "bg-up-soft text-up-ink" : state === "down" ? "bg-down-soft text-down-ink" : "bg-line text-muted-ink"}`}
          >
            {state === "up" ? "Up" : state === "down" ? "Down" : "No checks yet"}
            {f && f.status.uptime !== null && ` · ${formatPercent(f.status.uptime)} ${range.key === "12m" ? "last 30 days" : RANGE_PHRASE[range.key].replace("in the ", "")}`}
          </span>
          <a href={project.url} className="text-sm text-muted underline hover:text-ink">
            {project.url.replace("https://", "")}
          </a>
        </div>
        <RangePicker current={range.key} path={base} params={keep} />
      </div>
      <p className="-mt-2 text-sm text-muted">
        {range.words} · every number below uses this range · <TimezoneControl tz={tz} hasCookie={hasCookie} back={hrefWith(base, keep, {})} />
      </p>

      {/* Wraps on small screens instead of scrolling sideways */}
      <nav aria-label="Project sections" className="flex flex-wrap gap-x-7 border-b border-line">
        {TABS.map(([t, text]) => (
          <Link
            key={t}
            href={hrefWith(base, { range: range.key }, { tab: t })}
            aria-current={t === tab ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-0.5 text-sm ${t === tab ? "border-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
          >
            {text}
          </Link>
        ))}
      </nav>

      <StorySlider
        key={`${range.key}-${tab}`}
        stories={toSlides(stories, range)}
        label={`${project.name}, ${tabLabel}: one story at a time`}
        failed={!f}
        retryHref={hrefWith(base, keep, {})}
      />

      {!f ? (
        <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted">Couldn&apos;t load this project&apos;s numbers. Reload the page to try again.</p>
      ) : tab === "overview" ? (
        <OverviewTab f={f} range={range} deploy={deploy} />
      ) : tab === "traffic" ? (
        <TrafficTab f={f} range={range} sort={parseSort(sp.sort)} params={keep} />
      ) : tab === "events" ? (
        <EventsTab f={f} range={range} />
      ) : tab === "performance" ? (
        <PerformanceTab id={id} range={range} device={parseDevice(sp.device)} params={keep} deploys={deploy ? [{ at: deploy.at, commit: deploy.commit }] : []} />
      ) : tab === "uptime" ? (
        <UptimeTab project={project} range={range} />
      ) : (
        <ApiTab project={project} range={range} />
      )}

      <p className="text-sm text-muted">
        <Link href={`/logs?project=${project.id}`} className="underline hover:text-ink">
          See this project&apos;s logs
        </Link>
      </p>
    </div>
  );
}
