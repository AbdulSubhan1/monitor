import { db, schema } from "@/server/db";
import { parseBeacon } from "@/lib/ingest";
import { localDay } from "@/lib/time";
import { isBot, visitorHash, visitorSecret } from "@/lib/visitor";
import { clientIp, rateLimited, withinDailyCap } from "@/server/guard";

// A real visitor sends a handful of these per page; 120 a minute from one address is a script, not a person
const PER_MINUTE = 120;

// The beacon posts here with sendBeacon and a text/plain body, which is a "simple" request: no CORS preflight.
export async function POST(request: Request) {
  const ip = clientIp(request);
  // Checked before parsing, in memory: a flood never reaches the database
  if (rateLimited(`collect|${ip}`, PER_MINUTE, 60_000)) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }
  const origin = request.headers.get("origin");
  const userAgent = request.headers.get("user-agent");
  const parsed = parseBeacon(await request.text(), origin);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const headers = { "Access-Control-Allow-Origin": origin!, Vary: "Origin" };
  // Crawlers and lab tools get the normal answer, but nothing is stored
  if (isBot(userAgent)) return new Response(null, { status: 204, headers });

  const { table, ...row } = parsed.value;
  const capTable = table === "events" ? "events" : table === "vitals" ? "vitals" : "logs";
  if (await withinDailyCap(capTable, row.project)) {
    if (table === "events") {
      // Raw IP and user agent are only hashed, never stored
      const visitor = visitorHash(visitorSecret(), localDay(new Date()), row.project, ip, userAgent!);
      await db.insert(schema.events).values({ ...(row as typeof schema.events.$inferInsert), visitor });
    } else if (table === "vitals") {
      await db.insert(schema.vitals).values(row as typeof schema.vitals.$inferInsert);
    } else {
      await db.insert(schema.logs).values(row as typeof schema.logs.$inferInsert);
    }
  }
  // The allowed origin may read the answer (useful for the fetch fallback); nobody else can
  return new Response(null, { status: 204, headers });
}
