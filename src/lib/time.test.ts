import { describe, expect, it } from "vitest";
import { addDays, localDay, localHour, localTime, startOfLocalDay } from "@/lib/time";

// Asia/Karachi is UTC+5 all year
describe("dashboard timezone", () => {
  it("puts an instant on its local day, not its UTC day", () => {
    expect(localDay(new Date("2026-11-21T18:59:59Z"))).toBe("2026-11-21");
    expect(localDay(new Date("2026-11-21T19:00:00Z"))).toBe("2026-11-22");
    expect(localHour(new Date("2026-11-21T19:30:00Z"))).toBe(0);
  });

  it("finds local midnight", () => {
    expect(startOfLocalDay(new Date("2026-11-21T20:00:00Z")).toISOString()).toBe("2026-11-21T19:00:00.000Z");
    expect(localTime(2026, 11, 21).toISOString()).toBe("2026-11-20T19:00:00.000Z");
    expect(localTime(2026, 13, 1).toISOString()).toBe("2026-12-31T19:00:00.000Z");
  });

  it("adds days across months", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
