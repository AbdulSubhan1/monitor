import { db, schema } from "@/server/db";
import { parseCalls } from "@/lib/ingest";
import { verifyLogToken } from "@/lib/tokens";

// Server-to-server, same token as /api/logs: an app reports the API calls it makes, with status and time
export async function POST(request: Request) {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return Response.json({ error: "API call logging is not configured" }, { status: 503 });

  const project = verifyLogToken(request.headers.get("authorization"), secret);
  if (!project) return Response.json({ error: "invalid token" }, { status: 401 });

  const parsed = parseCalls(await request.text());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  await db.insert(schema.apiCalls).values(parsed.value.map((call) => ({ project, ...call })));
  return new Response(null, { status: 204 });
}
