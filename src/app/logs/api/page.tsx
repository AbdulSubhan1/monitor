import type { Metadata } from "next";
import { connection } from "next/server";
import { Chip, LogTabs } from "@/components/chip";
import { formatTime, timeAgo } from "@/lib/format";
import { findProject, PROJECTS } from "@/lib/projects";
import { getRecentApiCalls } from "@/server/queries";

export const metadata: Metadata = { title: "API calls" };

function statusTone(status: number | null): string {
  if (status === null || status >= 500) return "bg-down-soft text-down";
  if (status >= 400) return "bg-warn-soft text-warn";
  return "bg-up-soft text-up";
}

export default async function ApiCallsPage({ searchParams }: PageProps<"/logs/api">) {
  await connection();
  const params = await searchParams;
  const project = typeof params.project === "string" && findProject(params.project) ? params.project : undefined;
  const failedOnly = params.failed === "1";
  const rows = await getRecentApiCalls({ project, failedOnly });

  const href = (next: { project?: string; failed?: boolean }) => {
    const q = new URLSearchParams();
    const p = "project" in next ? next.project : project;
    const f = "failed" in next ? next.failed : failedOnly;
    if (p) q.set("project", p);
    if (f) q.set("failed", "1");
    const s = q.toString();
    return s ? `/logs/api?${s}` : "/logs/api";
  };

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold md:text-3xl">Logs</h1>
      <LogTabs current="api" />
      <p className="mb-5 text-sm text-muted">
        Every API call an app reports: method, route (ids shown as :id), status and time. Newest first, last 100.
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
        <Chip href={href({ failed: false })} active={!failedOnly}>
          All calls
        </Chip>
        <Chip href={href({ failed: true })} active={failedOnly}>
          Failed and 4xx only
        </Chip>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">No API calls for this filter.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 p-3 text-xs md:flex-row md:items-center md:gap-3 md:p-4">
              <span className="flex items-center gap-2">
                <span className={`inline-block w-12 rounded px-1.5 py-0.5 text-center font-mono ${statusTone(r.status)}`}>
                  {r.status ?? "—"}
                </span>
                <span className="text-muted" title={formatTime(r.createdAt)}>
                  {timeAgo(r.createdAt)}
                </span>
                <span className="font-medium">{findProject(r.project)?.name ?? r.project}</span>
              </span>
              <span className="min-w-0 truncate font-mono md:flex-1">
                <span className="text-muted">{r.method} </span>
                {r.host && <span className="text-muted">{r.host}</span>}
                {r.route}
                {r.error && <span className="text-down"> · {r.error}</span>}
              </span>
              <span className="font-mono tabular-nums text-muted">{r.ms} ms</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
