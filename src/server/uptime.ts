import "server-only";
import { lt } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PROJECTS, type Project } from "@/lib/projects";
import { RAW_EVENT_DAYS, ROLLUP_DAYS } from "@/server/rollups";

const TIMEOUT_MS = 10_000;
// Checks, logs, vitals, API calls and security events: 30 days. Raw events: 60 days (the 30-day view compares with the
// 30 days before). Daily rollups: 400 days, for the 12-month view.
export const RETENTION_DAYS = 30;

type CheckResult = { project: string; ok: boolean; status: number | null; ms: number; error: string | null };

async function checkOne(project: Project): Promise<CheckResult> {
  const started = performance.now();
  try {
    // redirect "manual": a 3xx is an answer from a healthy app (PolicyDesk sends visitors to its login page)
    const res = await fetch(project.url + project.checkPath, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "AbdulSubhan-Pulse/1.0 (+uptime check of my own sites)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = Math.round(performance.now() - started);
    return { project: project.id, ok: res.status < 400, status: res.status, ms, error: null };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    const error = err instanceof Error ? (err.name === "TimeoutError" ? `timed out after ${TIMEOUT_MS / 1000}s` : err.message) : "failed";
    return { project: project.id, ok: false, status: null, ms, error };
  }
}

// Checks every project at once and stores the results; also drops data older than the retention window
export async function runChecks() {
  const results = await Promise.all(PROJECTS.map(checkOne));
  await db.insert(schema.checks).values(results);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const eventsCutoff = new Date(Date.now() - RAW_EVENT_DAYS * 86_400_000);
  const rollupCutoff = new Date(Date.now() - ROLLUP_DAYS * 86_400_000).toISOString().slice(0, 10);
  await Promise.all([
    db.delete(schema.checks).where(lt(schema.checks.checkedAt, cutoff)),
    db.delete(schema.events).where(lt(schema.events.createdAt, eventsCutoff)),
    db.delete(schema.dailyStats).where(lt(schema.dailyStats.day, rollupCutoff)),
    db.delete(schema.logs).where(lt(schema.logs.createdAt, cutoff)),
    db.delete(schema.vitals).where(lt(schema.vitals.createdAt, cutoff)),
    db.delete(schema.apiCalls).where(lt(schema.apiCalls.createdAt, cutoff)),
    db.delete(schema.securityEvents).where(lt(schema.securityEvents.createdAt, cutoff)),
  ]);
  return results;
}
