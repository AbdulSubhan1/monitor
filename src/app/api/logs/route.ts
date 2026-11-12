import { db, schema } from "@/server/db";
import { parseLogs } from "@/lib/ingest";
import { verifyLogToken } from "@/lib/tokens";

// Server-to-server: an app's server sends errors and key logs with its own token
export async function POST(request: Request) {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return Response.json({ error: "logs are not configured" }, { status: 503 });

  const project = verifyLogToken(request.headers.get("authorization"), secret);
  if (!project) return Response.json({ error: "invalid token" }, { status: 401 });

  const parsed = parseLogs(await request.text());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

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
