import { db, schema } from "@/server/db";
import { parseCalls } from "@/lib/ingest";
import { withinDailyCap } from "@/server/guard";
import { projectFromToken } from "@/server/ingest-auth";

// Server-to-server, same token as /api/logs: an app reports the API calls it makes, with status and time
export async function POST(request: Request) {
  const auth = await projectFromToken(request);
  if ("response" in auth) return auth.response;
  const { project } = auth;

  const parsed = parseCalls(await request.text());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  if (!(await withinDailyCap("api_calls", project, parsed.value.length))) return new Response(null, { status: 204 });
  await db.insert(schema.apiCalls).values(parsed.value.map((call) => ({ project, ...call })));
  return new Response(null, { status: 204 });
}
