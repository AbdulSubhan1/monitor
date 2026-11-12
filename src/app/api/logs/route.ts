import { db, schema } from "@/server/db";
import { parseLogs } from "@/lib/ingest";
import { withinDailyCap } from "@/server/guard";
import { projectFromToken } from "@/server/ingest-auth";

// Server-to-server: an app's server sends errors and key logs with its own token
export async function POST(request: Request) {
  const auth = await projectFromToken(request);
  if ("response" in auth) return auth.response;
  const { project } = auth;

  const parsed = parseLogs(await request.text());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  // Over today's cap the logs are dropped, not stored: the free database stays safe even if an app loops on errors
  if (!(await withinDailyCap("logs", project, parsed.value.length))) return new Response(null, { status: 204 });
  await db.insert(schema.logs).values(
    parsed.value.map((log) => ({
      project,
      level: log.level,
      source: "server" as const,
      message: log.message,
      path: log.path ?? null,
      context: log.context ?? null,
    })),
  );
  return new Response(null, { status: 204 });
}
