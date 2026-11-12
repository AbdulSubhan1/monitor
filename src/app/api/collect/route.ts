import { db, schema } from "@/server/db";
import { parseBeacon } from "@/lib/ingest";

// The beacon posts here with sendBeacon and a text/plain body, which is a "simple" request: no CORS preflight.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const parsed = parseBeacon(await request.text(), origin);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  const { table, ...row } = parsed.value;
  if (table === "events") {
    await db.insert(schema.events).values(row as typeof schema.events.$inferInsert);
  } else if (table === "vitals") {
    await db.insert(schema.vitals).values(row as typeof schema.vitals.$inferInsert);
  } else {
    await db.insert(schema.logs).values(row as typeof schema.logs.$inferInsert);
  }
  // The allowed origin may read the answer (useful for the fetch fallback); nobody else can
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin!, Vary: "Origin" } });
}
