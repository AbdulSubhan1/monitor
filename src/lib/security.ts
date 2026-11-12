import { z } from "zod";

// Pure parts of security monitoring: the shape apps send, masking, and the brute-force rules. No database here.

export const SECURITY_TYPES = ["login_failed", "login_succeeded", "login_blocked", "auth_failed"] as const;
export type SecurityType = (typeof SECURITY_TYPES)[number];
export const SECURITY_MAX_BATCH = 20;

const eventSchema = z.strictObject({
  type: z.enum(SECURITY_TYPES),
  // The account tried (an email) and the client IP: hashed on arrival, never stored as sent
  account: z.string().trim().min(1).max(200).optional(),
  ip: z.string().trim().min(1).max(64).optional(),
  path: z.string().max(300).optional(),
  // Short machine reason: "wrong_password", "unknown_account", "inactive", "rate_limited", ...
  reason: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,39}$/)
    .optional(),
});

export type SecurityInput = z.infer<typeof eventSchema>;

export function parseSecurity(body: string): { ok: true; value: SecurityInput[] } | { ok: false; status: number; error: string } {
  if (new TextEncoder().encode(body).length > 8 * 1024) return { ok: false, status: 413, error: "payload too large" };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
  const parsed = z.union([eventSchema, z.array(eventSchema).min(1).max(SECURITY_MAX_BATCH)]).safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: Array.isArray(parsed.data) ? parsed.data : [parsed.data] };
}

// "ayesha.khan@example.com" -> "ay***@example.com"; anything else keeps its first two characters
export function maskAccount(account: string): string {
  const value = account.trim().toLowerCase();
  const at = value.indexOf("@");
  if (at > 0) return `${value.slice(0, Math.min(2, at))}***${value.slice(at)}`;
  return `${value.slice(0, 2)}***`;
}

export type SecurityEvent = {
  project: string;
  type: SecurityType;
  source: string | null;
  account: string | null;
  accountHint: string | null;
  createdAt: Date;
};

export type AlertKind = "one_source" | "one_account" | "spraying" | "success_after_failures" | "blocked";

export type Alert = {
  kind: AlertKind;
  project: string;
  severity: "warning" | "critical";
  count: number;
  first: Date;
  last: Date;
  accountHint: string | null;
};

// Thresholds inside one 15-minute window
export const WINDOW_MS = 15 * 60_000;
export const RULES = { oneSource: 10, oneAccount: 5, sprayAccounts: 5, failuresBeforeSuccess: 5 } as const;

// The largest number of events inside any WINDOW_MS span (events sorted by time), with that span's first and last time
function densest(times: Date[]): { count: number; first: Date; last: Date } {
  let best = { count: 0, first: times[0], last: times[0] };
  let start = 0;
  for (let end = 0; end < times.length; end++) {
    while (times[end].getTime() - times[start].getTime() > WINDOW_MS) start++;
    if (end - start + 1 > best.count) best = { count: end - start + 1, first: times[start], last: times[end] };
  }
  return best;
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

// Brute-force rules over recent events (any order). Sliding 15-minute windows, so a burst split across a clock
// boundary is still caught.
export function detectBruteForce(events: SecurityEvent[]): Alert[] {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const failed = sorted.filter((e) => e.type === "login_failed" || e.type === "auth_failed");
  const alerts: Alert[] = [];

  for (const [, list] of groupBy(failed, (e) => (e.source ? `${e.project}|${e.source}` : null))) {
    const burst = densest(list.map((e) => e.createdAt));
    if (burst.count >= RULES.oneSource) {
      alerts.push({ kind: "one_source", project: list[0].project, severity: "warning", ...burst, accountHint: null });
    }
    // Spraying: one source failing on many different accounts in a window
    const inBurst = list.filter((e) => e.createdAt >= burst.first && e.createdAt <= burst.last);
    const accounts = new Set(inBurst.map((e) => e.account).filter(Boolean));
    if (accounts.size >= RULES.sprayAccounts) {
      alerts.push({ kind: "spraying", project: list[0].project, severity: "warning", ...burst, count: accounts.size, accountHint: null });
    }
  }

  for (const [, list] of groupBy(failed, (e) => (e.account ? `${e.project}|${e.account}` : null))) {
    const burst = densest(list.map((e) => e.createdAt));
    if (burst.count >= RULES.oneAccount) {
      alerts.push({ kind: "one_account", project: list[0].project, severity: "warning", ...burst, accountHint: list[0].accountHint });
    }
  }

  // A success right after many failures on the same account may be a guessed password
  for (const success of sorted.filter((e) => e.type === "login_succeeded" && e.account)) {
    const before = failed.filter(
      (e) =>
        e.project === success.project &&
        e.account === success.account &&
        e.createdAt <= success.createdAt &&
        success.createdAt.getTime() - e.createdAt.getTime() <= WINDOW_MS,
    );
    if (before.length >= RULES.failuresBeforeSuccess) {
      alerts.push({
        kind: "success_after_failures",
        project: success.project,
        severity: "critical",
        count: before.length,
        first: before[0].createdAt,
        last: success.createdAt,
        accountHint: success.accountHint,
      });
    }
  }

  // The app itself already blocked a source: worth showing even under the thresholds above
  for (const [, list] of groupBy(sorted.filter((e) => e.type === "login_blocked"), (e) => e.project)) {
    alerts.push({
      kind: "blocked",
      project: list[0].project,
      severity: "warning",
      count: list.length,
      first: list[0].createdAt,
      last: list[list.length - 1].createdAt,
      accountHint: null,
    });
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? b.last.getTime() - a.last.getTime() : a.severity === "critical" ? -1 : 1));
}

const ALERT_TEXT: Record<AlertKind, (a: Alert) => string> = {
  one_source: (a) => `${a.count} failed logins from one source within 15 minutes`,
  one_account: (a) => `${a.count} failed logins on ${a.accountHint ?? "one account"} within 15 minutes`,
  spraying: (a) => `One source tried ${a.count} different accounts within 15 minutes (password spraying)`,
  success_after_failures: (a) =>
    `${a.accountHint ?? "An account"} signed in right after ${a.count} failed tries: check it was really the owner`,
  blocked: (a) => `The app blocked a source ${a.count === 1 ? "once" : `${a.count} times`} for too many attempts`,
};

export const ALERT_TITLE: Record<AlertKind, string> = {
  one_source: "Brute force from one source",
  one_account: "Password guessing on one account",
  spraying: "Password spraying",
  success_after_failures: "Possible break-in",
  blocked: "Source blocked",
};

export function describeAlert(alert: Alert): string {
  return ALERT_TEXT[alert.kind](alert);
}
