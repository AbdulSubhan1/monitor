import "server-only";
import { db, schema } from "@/server/db";
import { clientIp, keyedHash, rateLimited, recentHits, withinDailyCap } from "@/server/guard";
import { maskAccount, type SecurityInput } from "@/lib/security";

// Stores security events (hashed account and source, masked hint) within the daily cap. Returns how many were stored.
export async function recordSecurity(project: string, inputs: SecurityInput[]): Promise<number> {
  if (!(await withinDailyCap("security_events", project, inputs.length))) return 0;
  await db.insert(schema.securityEvents).values(
    inputs.map((e) => ({
      project,
      type: e.type,
      source: e.ip ? keyedHash("source", e.ip) : null,
      account: e.account ? keyedHash("account", e.account) : null,
      accountHint: e.account ? maskAccount(e.account) : null,
      path: e.path ?? null,
      reason: e.reason ?? null,
    })),
  );
  return inputs.length;
}

const WINDOW_MS = 15 * 60_000;
const RECORD_PER_WINDOW = 10;

// Attempts on Pulse itself (wrong logs password, bad tokens, bad cron secret). The first 10 per source in 15 minutes
// are stored, then one "blocked" event; the rest only cost memory. Returns true once the source is over the limit,
// so the caller can refuse it without checking anything.
export async function notePulseAuthFailure(request: Request, reason: string): Promise<boolean> {
  const ip = clientIp(request);
  const path = new URL(request.url).pathname;
  const key = `pulse-auth|${ip}`;
  const over = rateLimited(key, RECORD_PER_WINDOW, WINDOW_MS);
  if (!over) await recordSecurity("pulse", [{ type: "auth_failed", ip, path, reason }]).catch(() => 0);
  return over;
}

// True while a source is over the limit: refuse it before checking its password or token at all. The block itself is
// recorded once per window.
export async function pulseSourceBlocked(request: Request): Promise<boolean> {
  const ip = clientIp(request);
  if (recentHits(`pulse-auth|${ip}`, WINDOW_MS) < RECORD_PER_WINDOW) return false;
  if (!rateLimited(`pulse-auth|${ip}|blocked`, 1, WINDOW_MS)) {
    const path = new URL(request.url).pathname;
    await recordSecurity("pulse", [{ type: "login_blocked", ip, path, reason: "rate_limited" }]).catch(() => 0);
  }
  return true;
}
