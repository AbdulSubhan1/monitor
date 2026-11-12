import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LevelTag } from "@/components/status";
import { formatTime, timeAgo } from "@/lib/format";
import { findProject, PROJECTS } from "@/lib/projects";
import { getLogs, LEVELS, type Level } from "@/server/queries";

export const metadata: Metadata = { title: "Logs" };

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${active ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
  await connection();
  const params = await searchParams;
  const project = typeof params.project === "string" && findProject(params.project) ? params.project : undefined;
  const level = LEVELS.find((l) => l === params.level) as Level | undefined;
  const rows = await getLogs({ project, level });

  // Filters are plain links, so every view has a shareable URL and the page needs no client JavaScript
  const href = (next: { project?: string; level?: string }) => {
    const q = new URLSearchParams();
    const p = "project" in next ? next.project : project;
    const l = "level" in next ? next.level : level;
    if (p) q.set("project", p);
    if (l) q.set("level", l);
    const s = q.toString();
    return s ? `/logs?${s}` : "/logs";
  };

  return (
    <>
      <h1 className="text-2xl font-semibold md:text-3xl">Logs</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Server errors and logs sent with each app&apos;s token, and browser errors from the beacon. Newest first, last 100.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <Chip href={href({ project: undefined })} active={!project}>
          All projects
        </Chip>
        {PROJECTS.map((p) => (
          <Chip key={p.id} href={href({ project: p.id })} active={project === p.id}>
            {p.name}
          </Chip>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href={href({ level: undefined })} active={!level}>
          All levels
        </Chip>
        {LEVELS.map((l) => (
          <Chip key={l} href={href({ level: l })} active={level === l}>
            {l}
          </Chip>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Nothing logged for this filter.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {rows.map((r) => (
            <li key={r.id} className="p-3 md:p-4">
              <details>
                <summary className="flex cursor-pointer list-none flex-col gap-1 md:flex-row md:items-center md:gap-3">
                  <span className="flex items-center gap-2">
                    <LevelTag level={r.level} />
                    <span className="text-xs text-muted" title={formatTime(r.createdAt)}>
                      {timeAgo(r.createdAt)}
                    </span>
                    <span className="text-xs font-medium">{findProject(r.project)?.name ?? r.project}</span>
                    <span className="text-xs text-muted">{r.source}</span>
                  </span>
                  <span className="min-w-0 truncate font-mono text-xs md:flex-1">{r.message}</span>
                  {r.path && <span className="font-mono text-xs text-muted">{r.path}</span>}
                </summary>
                <div className="mt-3 space-y-2 text-xs">
                  <p className="font-mono break-words whitespace-pre-wrap">{r.message}</p>
                  <p className="text-muted">{formatTime(r.createdAt)}</p>
                  {r.context && (
                    <pre className="overflow-x-auto rounded bg-paper p-3 font-mono text-[11px]">{JSON.stringify(r.context, null, 2)}</pre>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
