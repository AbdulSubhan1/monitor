/**
 * Creates or updates the tables. No seed data: everything Pulse shows is real traffic.
 *   npm run db:setup                    -> local PGlite in ./.pglite
 *   DATABASE_URL=... npm run db:setup   -> Neon
 */
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { db } from "@/server/db";

async function main() {
  if (process.env.DATABASE_URL) {
    await migrateNeon(db as never, { migrationsFolder: "./drizzle" });
  } else {
    await migratePglite(db, { migrationsFolder: "./drizzle" });
  }
  console.log("Tables are up to date.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
