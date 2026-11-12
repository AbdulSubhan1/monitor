import { parseSecurity } from "@/lib/security";
import { projectFromToken } from "@/server/ingest-auth";
import { recordSecurity } from "@/server/security";

// Server-to-server, same token as /api/logs: failed and successful logins, blocks. Accounts and IPs are hashed on arrival.
export async function POST(request: Request) {
  const auth = await projectFromToken(request);
  if ("response" in auth) return auth.response;

  const parsed = parseSecurity(await request.text());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  await recordSecurity(auth.project, parsed.value);
  return new Response(null, { status: 204 });
}
