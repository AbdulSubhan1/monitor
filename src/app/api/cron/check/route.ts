import { bearerMatches } from "@/lib/tokens";
import { notePulseAuthFailure, pulseSourceBlocked } from "@/server/security";
import { runChecks } from "@/server/uptime";

// Called every 10 minutes by the QStash schedule (src/server/qstash.ts), or by hand from the GitHub workflow, with CRON_SECRET
export async function POST(request: Request) {
  if (await pulseSourceBlocked(request)) return Response.json({ error: "too many attempts" }, { status: 429 });
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    await notePulseAuthFailure(request, "bad_cron_secret");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runChecks();
  return Response.json({ checked: results.length, down: results.filter((r) => !r.ok).map((r) => r.project) });
}
