// The 10-minute uptime trigger. GitHub's free schedules are best effort (late, sometimes skipped), so an Upstash
// QStash schedule calls /api/cron/check instead. QStash forwards our own cron secret, so the route keeps one check.
// Free plan: 500 messages a day, shared with PaySandbox; every 10 minutes is 144.

export const SCHEDULE_ID = "pulse-uptime";
export const UPTIME_CRON = "*/10 * * * *";

type Env = { QSTASH_URL?: string; QSTASH_TOKEN?: string; CRON_SECRET?: string };

// Creates or updates (same schedule id) the schedule; calling it again is safe
export async function ensureUptimeSchedule(destination: string, env: Env = process.env as Env): Promise<string> {
  const { QSTASH_URL, QSTASH_TOKEN, CRON_SECRET } = env;
  if (!QSTASH_TOKEN || !CRON_SECRET) throw new Error("QSTASH_TOKEN and CRON_SECRET must be set");
  const base = (QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");
  const res = await fetch(`${base}/v2/schedules/${destination}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${QSTASH_TOKEN}`,
      "Upstash-Schedule-Id": SCHEDULE_ID,
      "Upstash-Cron": UPTIME_CRON,
      "Upstash-Method": "POST",
      // A missed run is better than a doubled one: the next run is only 10 minutes away
      "Upstash-Retries": "0",
      "Upstash-Forward-Authorization": `Bearer ${CRON_SECRET}`,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`QStash answered ${res.status}`);
  const { scheduleId } = (await res.json()) as { scheduleId: string };
  return scheduleId;
}
