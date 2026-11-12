import type { Metadata } from "next";
import { connection } from "next/server";
import { Chip, LogTabs } from "@/components/chip";
import { formatTime, timeAgo } from "@/lib/format";
import { findProject, PROJECTS } from "@/lib/projects";
import { ALERT_TITLE, describeAlert, RULES } from "@/lib/security";
import { getSecurity } from "@/server/queries";

export const metadata: Metadata = { title: "Security" };

const TYPE_TONE: Record<string, string> = {
  login_failed: "bg-warn-soft text-warn",
  auth_failed: "bg-warn-soft text-warn",
  login_blocked: "bg-down-soft text-down",
  login_succeeded: "bg-up-soft text-up",
};

const projectName = (id: string) => (id === "pulse" ? "Pulse (this app)" : (findProject(id)?.name ?? id));

export default async function SecurityPage({ searchParams }: PageProps<"/logs/security">) {
  await connection();
  const params = await searchParams;
  const project =
    params.project === "pulse" || (typeof params.project === "string" && findProject(params.project))
      ? (params.project as string)
      : undefined;
  const { rows, alerts } = await getSecurity(project);
  const href = (p?: string) => (p ? `/logs/security?project=${p}` : "/logs/security");

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold md:text-3xl">Logs</h1>
      <LogTabs current="security" />
      <p className="mb-5 text-sm text-muted">
        Logins and bad tokens, last 24 hours. Accounts and sources are stored as keyed hashes; emails are masked. Alerts use
        15-minute windows: {RULES.oneSource} failures from one source, {RULES.oneAccount} on one account, one source on{" "}
        {RULES.sprayAccounts} accounts, or a sign-in after {RULES.failuresBeforeSuccess} failures.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        <Chip href={href()} active={!project}>
          All projects
        </Chip>
        {[...PROJECTS.map((p) => p.id), "pulse"].map((id) => (
          <Chip key={id} href={href(id)} active={project === id}>
            {projectName(id)}
          </Chip>
        ))}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Alerts</h2>
        {alerts.length === 0 ? (
          <p className="rounded-xl border border-line bg-card p-4 text-sm text-up">No brute-force patterns in the last 24 hours.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={`rounded-xl border p-4 text-sm ${a.severity === "critical" ? "border-down bg-down-soft" : "border-warn bg-warn-soft"}`}
              >
                <p className={`font-semibold ${a.severity === "critical" ? "text-down" : "text-warn"}`}>
                  {ALERT_TITLE[a.kind]} · {projectName(a.project)}
                </p>
                <p className="mt-1">{describeAlert(a)}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatTime(a.first)} to {formatTime(a.last)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mb-2 text-sm font-semibold">Events</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">No security events.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {rows.slice(0, 200).map((r) => (
            <li key={r.id} className="flex flex-col gap-1 p-3 text-xs md:flex-row md:items-center md:gap-3 md:p-4">
              <span className="flex items-center gap-2">
                <span className={`inline-block rounded px-1.5 py-0.5 font-mono ${TYPE_TONE[r.type]}`}>{r.type}</span>
                <span className="text-muted" title={formatTime(r.createdAt)}>
                  {timeAgo(r.createdAt)}
                </span>
                <span className="font-medium">{projectName(r.project)}</span>
              </span>
              <span className="min-w-0 truncate font-mono md:flex-1">
                {r.accountHint ?? "–"}
                {r.reason && <span className="text-muted"> · {r.reason}</span>}
                {r.path && <span className="text-muted"> · {r.path}</span>}
              </span>
              <span className="font-mono text-muted" title="Source (keyed hash of the IP)">
                {r.source ?? "–"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
