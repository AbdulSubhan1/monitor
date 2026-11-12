import { describe, expect, it } from "vitest";
import { SLOTS_24H, toSlots } from "@/lib/slots";

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
