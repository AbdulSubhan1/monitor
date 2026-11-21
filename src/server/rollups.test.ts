import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { rollUpDay, runRollups } from "@/server/rollups";

// Against a real (in-memory) Postgres with the real migrations
const db = drizzle(new PGlite(), { schema, casing: "snake_case" });
const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const ev = (o: Partial<typeof schema.events.$inferInsert>) => ({ project: "brokwise", type: "pageview" as const, name: "pageview", path: "/", ...o });
  await db.insert(schema.events).values([
    ev({ visitor: "hashAAAAAAAAAAAA", createdAt: at("2026-11-20T10:00:00Z"), source: "portfolio", device: "mobile" }),
    ev({ visitor: "hashAAAAAAAAAAAA", createdAt: at("2026-11-20T10:01:00Z"), path: "/car" }),
    ev({ visitor: "hashBBBBBBBBBBBB", createdAt: at("2026-11-20T23:59:00Z"), referrer: "www.google.com" }),
    ev({ type: "event", name: "quote_form_submitted", label: "car", visitor: "hashAAAAAAAAAAAA", createdAt: at("2026-11-20T10:02:00Z") }),
    ev({ type: "event", name: "time_on_page", visitor: "hashAAAAAAAAAAAA", value: 30_000, createdAt: at("2026-11-20T10:03:00Z") }),
    // Next day and the month before
    ev({ visitor: "hashAAAAAAAAAAAA", createdAt: at("2026-11-21T00:10:00Z") }),
    ev({ visitor: "hashAAAAAAAAAAAA", createdAt: at("2026-10-05T08:00:00Z") }),
    ev({ visitor: "hashCCCCCCCCCCCC", createdAt: at("2026-10-20T08:00:00Z") }),
    ev({ visitor: "hashAAAAAAAAAAAA", createdAt: at("2026-10-21T08:00:00Z") }),
  ]);
});

describe("rollups", () => {
  it("rolls up one UTC day: totals, pages, sources, events and devices", async () => {
    await rollUpDay(db, "2026-11-20");
    const rows = await db.select().from(schema.dailyStats);
    const get = (kind: string, key = "", label = "") => rows.find((r) => r.day === "2026-11-20" && r.kind === kind && r.key === key && r.label === label);
    expect(get("total")).toMatchObject({ views: 3, visitors: 2, events: 1 });
    expect(get("page", "/")).toMatchObject({ views: 2, visitors: 2 });
    expect(get("source", "portfolio")).toMatchObject({ views: 1 });
    expect(get("source", "www.google.com")).toMatchObject({ views: 1 });
    expect(get("source", "")).toMatchObject({ views: 1 });
    expect(get("event", "quote_form_submitted", "car")).toMatchObject({ events: 1 });
    expect(get("event", "time_on_page")).toMatchObject({ events: 1, valueSum: 30_000 });
    expect(get("device", "mobile")).toMatchObject({ views: 1 });
  });

  it("is idempotent: rolling the same day again gives the same rows", async () => {
    const before = await db.select().from(schema.dailyStats);
    await rollUpDay(db, "2026-11-20");
    expect(await db.select().from(schema.dailyStats)).toHaveLength(before.length);
  });

  it("the cron rolls up completed days only, and the previous month's distinct visitors", async () => {
    const days = await runRollups(db, at("2026-11-21T12:00:00Z"));
    expect(days).toEqual(["2026-10-05", "2026-10-20", "2026-10-21", "2026-11-20"]);
    const rows = await db.select().from(schema.dailyStats);
    expect(rows.some((r) => r.day === "2026-11-21")).toBe(false);
    // A came twice in October, C once: 2 people, 3 page views
    expect(rows.find((r) => r.kind === "month" && r.day === "2026-10-01")).toMatchObject({ visitors: 2, views: 3 });
  });

  it("keeps counts only: nothing hash-like in the rollups", async () => {
    const rows = await db.select().from(schema.dailyStats);
    expect(JSON.stringify(rows)).not.toMatch(/hash[A-C]{12}/);
  });
});
