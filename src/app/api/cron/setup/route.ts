import { bearerMatches } from "@/lib/tokens";
import { notePulseAuthFailure, pulseSourceBlocked } from "@/server/security";
import { ensureUptimeSchedule } from "@/server/qstash";

// One-off, safe to repeat: points the QStash schedule at this deployment's /api/cron/check. The QStash token stays on
// the server; the caller only proves it knows CRON_SECRET.
export async function POST(request: Request) {
  if (await pulseSourceBlocked(request)) return Response.json({ error: "too many attempts" }, { status: 429 });
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    await notePulseAuthFailure(request, "bad_cron_secret");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const destination = `${new URL(request.url).origin}/api/cron/check`;
  try {
    const scheduleId = await ensureUptimeSchedule(destination);
    return Response.json({ scheduleId, destination });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "failed" }, { status: 502 });
  }
}
