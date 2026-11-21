import { describe, expect, it } from "vitest";
import { parseRange, resolveRange } from "@/lib/range";

// 21 Nov 2026 14:30 in Karachi (UTC+5)
const NOW = new Date("2026-11-21T09:30:00Z");

describe("parseRange", () => {
  it("defaults to 7 days for anything unknown", () => {
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange(undefined)).toBe("7d");
    expect(parseRange("1y")).toBe("7d");
    expect(parseRange(["24h"])).toBe("7d");
  });
});

describe("resolveRange", () => {
  it("24h: 24 hourly buckets ending with the current hour, and the 24 hours before", () => {
    const r = resolveRange("24h", NOW);
    expect(r.unit).toBe("hour");
    expect(r.buckets).toHaveLength(24);
    expect(r.buckets[23].key).toBe("2026-11-21T14");
    expect(r.buckets[0].key).toBe("2026-11-20T15");
    expect(r.start.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2026-11-19T10:00:00.000Z");
  });

  it("7d: local days, today included, previous week of equal length", () => {
    const r = resolveRange("7d", NOW);
    expect(r.buckets.map((b) => b.key)).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ]);
    // Local midnight of 15 Nov is 19:00 UTC on 14 Nov
    expect(r.start.toISOString()).toBe("2026-11-14T19:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2026-11-07T19:00:00.000Z");
    expect(r.words).toBe("Last 7 days · 15–21 Nov");
  });

  it("uses the local day near midnight, not the UTC one", () => {
    // 22 Nov 00:30 in Karachi, still 21 Nov in UTC
    const r = resolveRange("7d", new Date("2026-11-21T19:30:00Z"));
    expect(r.buckets[6].key).toBe("2026-11-22");
  });

  it("30d crosses months in its words", () => {
    const r = resolveRange("30d", NOW);
    expect(r.buckets).toHaveLength(30);
    expect(r.buckets[0].key).toBe("2026-10-23");
    expect(r.words).toBe("Last 30 days · 23 Oct–21 Nov");
    expect(r.prevStart.toISOString()).toBe("2026-09-22T19:00:00.000Z");
  });

  it("12m: 12 months including this one, and the 12 before", () => {
    const r = resolveRange("12m", NOW);
    expect(r.buckets[0].key).toBe("2025-12");
    expect(r.buckets[11].key).toBe("2026-11");
    expect(r.start.toISOString()).toBe("2025-11-30T19:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2024-11-30T19:00:00.000Z");
    expect(r.words).toBe("Last 12 months · Dec 2025 – Nov 2026");
  });
});
