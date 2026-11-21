import { describe, expect, it } from "vitest";
import { SLOTS_24H, toSlots, uptimeBars } from "@/lib/slots";

const NOW = Date.UTC(2026, 10, 12, 12, 0);
const check = (minutesAgo: number, ok: boolean) => ({
  ok,
  at: new Date(NOW - minutesAgo * 60_000),
  status: ok ? 200 : 503,
  error: null,
  ms: 120,
});

describe("toSlots", () => {
  it("places checks in 10-minute slots and leaves gaps empty", () => {
    const slots = toSlots([check(5, true), check(25, false)], NOW);
    expect(slots).toHaveLength(SLOTS_24H);
    expect(slots[SLOTS_24H - 1]).toMatchObject({ ok: true });
    expect(slots[SLOTS_24H - 2]).toBeNull();
    expect(slots[SLOTS_24H - 3]).toMatchObject({ ok: false, label: "11:35 UTC · down: HTTP 503" });
  });

  it("lets a failure win a shared slot and ignores checks older than 24 h", () => {
    const slots = toSlots([check(3, false), check(4, true), check(24 * 60 + 5, false)], NOW);
    expect(slots[SLOTS_24H - 1]).toMatchObject({ ok: false });
    expect(slots.filter(Boolean)).toHaveLength(1);
  });
});

describe("uptimeBars", () => {
  it("puts checks in the bucket they fall in and leaves empty buckets null", () => {
    const now = Date.UTC(2026, 10, 21, 12, 30);
    const at = (h: number, ok = true) => ({ ok, at: new Date(now - h * 3_600_000), status: 200, error: null, ms: 100 });
    // Three day buckets starting at Karachi midnight (19:00 UTC)
    const buckets = [0, 1, 2].map((i) => ({ start: new Date(Date.UTC(2026, 10, 18 + i, 19)), label: `${19 + i} Nov` }));
    const bars = uptimeBars([at(0), at(0, false), at(30, false), at(200)], buckets);
    expect(bars[2]).toMatchObject({ ok: 1, total: 2 });
    expect(bars[1]).toMatchObject({ ok: 0, total: 1, label: "20 Nov · 0 of 1 checks good" });
    expect(bars[0]).toBeNull();
  });
});
