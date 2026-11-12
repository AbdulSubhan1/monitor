import "server-only";
import { lt } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { PROJECTS, type Project } from "@/lib/projects";

const TIMEOUT_MS = 10_000;
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
  await Promise.all([
    db.delete(schema.checks).where(lt(schema.checks.checkedAt, cutoff)),
    db.delete(schema.events).where(lt(schema.events.createdAt, cutoff)),
    db.delete(schema.logs).where(lt(schema.logs.createdAt, cutoff)),
    db.delete(schema.vitals).where(lt(schema.vitals.createdAt, cutoff)),
    db.delete(schema.apiCalls).where(lt(schema.apiCalls.createdAt, cutoff)),
  ]);
  return results;
}
