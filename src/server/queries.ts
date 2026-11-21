import "server-only";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { detectBruteForce } from "@/lib/security";
import { db, schema } from "@/server/db";

// Logs, API calls and security events for the password-protected logs pages. The dashboard's range queries live in
// src/server/insights.ts.

const { logs, apiCalls, securityEvents } = schema;
const HOUR = 3_600_000;
const since = (hours: number) => new Date(Date.now() - hours * HOUR);

export const LEVELS = ["debug", "info", "warn", "error"] as const;
export type Level = (typeof LEVELS)[number];

export async function getLogs(filter: { project?: string; level?: Level }, limit = 100) {
  const where: SQL[] = [];
  if (filter.project) where.push(eq(logs.project, filter.project));
  if (filter.level) where.push(eq(logs.level, filter.level));
  return db
    .select()
    .from(logs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(logs.createdAt))
    .limit(limit);
}

export async function getRecentApiCalls(filter: { project?: string; failedOnly?: boolean }, limit = 100) {
  const where: SQL[] = [];
  if (filter.project) where.push(eq(apiCalls.project, filter.project));
  if (filter.failedOnly) where.push(sql`(${apiCalls.status} is null or ${apiCalls.status} >= 400)`);
  return db
    .select()
    .from(apiCalls)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(apiCalls.createdAt))
    .limit(limit);
}

// The last 24 hours of security events (capped, so a flood can't make the page slow) and the brute-force alerts in them
export async function getSecurity(project?: string) {
  const rows = await db
    .select()
    .from(securityEvents)
    .where(and(gte(securityEvents.createdAt, since(24)), project ? eq(securityEvents.project, project) : undefined))
    .orderBy(desc(securityEvents.createdAt))
    .limit(5_000);
  return { rows, alerts: detectBruteForce(rows) };
}
