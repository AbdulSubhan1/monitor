import Link from "next/link";
import { connection } from "next/server";
import { MiniBars, toSlides } from "@/components/insight";
import { RangePicker } from "@/components/range-picker";
import { StatusPill } from "@/components/status";
import { StorySlider } from "@/components/story-slider";
import { TimezoneControl, viewerTz } from "@/components/timezone";
import type { ProjectFacts } from "@/lib/facts";
import { formatCount } from "@/lib/format";
import { findProject, PROJECTS } from "@/lib/projects";
import { parseRange, RANGE_PHRASE, resolveRange } from "@/lib/range";
import { buildStories, storiesFor, tally } from "@/lib/stories";
import { getFacts } from "@/server/insights";
import { getSecurity } from "@/server/queries";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection();
  const params = await searchParams;
  const { tz, hasCookie } = await viewerTz(params.tz);
  const range = resolveRange(parseRange(params.range), new Date(), tz);
  const path = "/";
  const keep = { range: range.key };

  const [facts, security] = await Promise.all([getFacts(range).catch(() => null), getSecurity().catch(() => null)]);
  const all = facts ? PROJECTS.map((p) => facts.get(p.id)!) : [];
  const stories = facts ? storiesFor(buildStories(all, { range, scope: { kind: "home" } })) : [];
  const down = all.filter((f) => f.status.downNow);
  const checked = all.some((f) => f.status.downNow !== null);
  const busy = all.filter((f) => f.views > 0).sort((a, b) => b.views - a.views);
  const quiet = all.filter((f) => f.views === 0);
  const criticalAlerts = security?.alerts.some((a) => a.severity === "critical");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">
            {!facts
              ? "Couldn't load the status"
              : !checked
                ? "Waiting for the first check"
                : down.length === 0
                  ? `All ${PROJECTS.length} projects are up`
                  : `${down.map((p) => p.name).join(", ")} ${down.length === 1 ? "is" : "are"} down`}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {range.words} · every number below uses this range ·{" "}
            <TimezoneControl tz={tz} hasCookie={hasCookie} back={range.key === "7d" ? "/" : `/?range=${range.key}`} />
          </p>
        </div>
        <RangePicker current={range.key} path={path} params={keep} />
      </div>

      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <Link href="/guide" className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-[13px] hover:border-muted">
          New here? Take the 2-minute tour →
        </Link>
        {stories.length > 0 && <span className="text-xs text-muted">{tally(stories)}</span>}
      </div>

      <StorySlider key={range.key} stories={toSlides(stories, range)} label="Stories across all projects, one at a time" failed={!facts} retryHref={`/?range=${range.key}`} />

      {security && security.alerts.length > 0 && (
        // Public page: counts and project names only; the details are behind the logs password
        <Link
          href="/logs/security"
          className={`block rounded-xl border p-4 text-sm ${criticalAlerts ? "border-down bg-down-soft text-down-ink" : "border-warn bg-warn-soft text-warn-ink"}`}
        >
          <span className="font-semibold">
            {security.alerts.length} security {security.alerts.length === 1 ? "alert" : "alerts"} in the last 24 hours
          </span>{" "}
          on {[...new Set(security.alerts.map((a) => (a.project === "pulse" ? "Pulse" : (findProject(a.project)?.name ?? a.project))))].join(", ")}.
          See details →
        </Link>
      )}

      <section aria-labelledby="projects">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="projects" className="text-lg font-semibold">
            Your projects
          </h2>
          <p className="text-xs text-muted">Busiest first · click a card to open its page</p>
        </div>
        {!facts ? (
          <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted">Couldn&apos;t load the projects&apos; numbers. Reload the page to try again.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {busy.map((f) => (
              <ProjectCard key={f.id} f={f} all={all} rangeKey={range.key} range={range} />
            ))}
            {quiet.map((f) => (
              <QuietCard key={f.id} f={f} rangeKey={range.key} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function projectLink(id: string, rangeKey: string) {
  return `/projects/${id}${rangeKey === "7d" ? "" : `?range=${rangeKey}`}`;
}

function Header({ f }: { f: ProjectFacts }) {
  const p = findProject(f.id)!;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-semibold">{f.name}</h3>
        <p className="truncate text-xs text-muted">{p.url.replace("https://", "")}</p>
      </div>
      <StatusPill state={f.status.downNow === null ? "unknown" : f.status.downNow ? "down" : "up"} />
    </div>
  );
}

function ProjectCard({ f, all, rangeKey, range }: { f: ProjectFacts; all: ProjectFacts[]; rangeKey: string; range: ReturnType<typeof resolveRange> }) {
  // The card's sentence is the project's own top story; the plain summary when nothing stands out
  const own = buildStories(all, { range, scope: { kind: "project", id: f.id } });
  const top = own.find((s) => !s.id.startsWith("summary")) ?? own[0];
  return (
    <li>
      <Link href={projectLink(f.id, rangeKey)} className="flex h-full flex-col gap-4 rounded-xl border border-line bg-card p-4 transition-colors hover:border-muted md:p-5">
        <Header f={f} />
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted">Visitors</dt>
            <dd className="font-mono text-lg tabular-nums">{f.visitorsSince ? formatCount(f.visitors) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Page views</dt>
            <dd className="font-mono text-lg tabular-nums">{formatCount(f.views)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Events</dt>
            <dd className="font-mono text-lg tabular-nums">{formatCount(f.events)}</dd>
          </div>
        </dl>
        <MiniBars points={f.buckets} label={`Page views per ${range.unit}`} />
        {top && <p className="mt-auto border-t border-line pt-3 text-[13px] leading-relaxed text-muted-ink">{top.title}.</p>}
      </Link>
    </li>
  );
}

function QuietCard({ f, rangeKey }: { f: ProjectFacts; rangeKey: "24h" | "7d" | "30d" | "12m" }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-paper p-4 md:p-5">
      <Link href={projectLink(f.id, rangeKey)} className="hover:underline">
        <Header f={f} />
      </Link>
      <div>
        <p className="text-sm font-medium">{f.dataStart ? `No visitors ${RANGE_PHRASE[rangeKey]}` : "Waiting for the first visit"}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Nobody opened it, or the Pulse script is missing.{" "}
          <Link href="/guide#script" className="font-medium text-ink underline">
            Check the script
          </Link>
        </p>
      </div>
    </li>
  );
}
