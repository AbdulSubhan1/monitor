import { PGlite } from "@electric-sql/pglite";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

// Production uses Neon Postgres; local dev uses an embedded Postgres (PGlite) so no install is needed
function createDb(): Db {
  if (process.env.DATABASE_URL) {
    return drizzleNeon(neon(process.env.DATABASE_URL), { schema, casing: "snake_case" }) as unknown as Db;
  }
  const g = globalThis as unknown as { pglite?: PGlite };
  // `next build` imports this from several workers at once; they must not share one data folder
  g.pglite ??= process.env.NEXT_PHASE === "phase-production-build" ? new PGlite() : new PGlite("./.pglite");
  return drizzlePglite(g.pglite, { schema, casing: "snake_case" });
}

export const db = createDb();
export { schema };
