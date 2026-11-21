import { describe, expect, it } from "vitest";
import { addDays, localClock, localDay, localHour, localTime, resolveTz, startOfLocalDay, validTz } from "@/lib/time";

describe("viewer timezone", () => {
  it("puts an instant on the viewer's day, not the UTC day (Asia/Karachi, UTC+5)", () => {
    const tz = "Asia/Karachi";
    expect(localDay(new Date("2026-11-21T18:59:59Z"), tz)).toBe("2026-11-21");
    expect(localDay(new Date("2026-11-21T19:00:00Z"), tz)).toBe("2026-11-22");
    expect(localHour(new Date("2026-11-21T19:30:00Z"), tz)).toBe(0);
    expect(localClock(new Date("2026-11-21T09:05:00Z"), tz)).toBe("14:05");
  });

  it("finds midnight in the viewer's timezone; 'today' changes at their midnight", () => {
    expect(startOfLocalDay(new Date("2026-11-21T20:00:00Z"), "Asia/Karachi").toISOString()).toBe("2026-11-21T19:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-11-21T20:00:00Z"), "UTC").toISOString()).toBe("2026-11-21T00:00:00.000Z");
    expect(localTime(2026, 13, 1, 0, "Asia/Karachi").toISOString()).toBe("2026-12-31T19:00:00.000Z");
  });

  it("handles a DST zone (Europe/London: UTC+1 in summer, UTC+0 in winter)", () => {
    expect(localTime(2026, 7, 1, 0, "Europe/London").toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(localTime(2026, 12, 1, 0, "Europe/London").toISOString()).toBe("2026-12-01T00:00:00.000Z");
    // The day the clocks go back (25 Oct 2026) has 25 hours
    const start = localTime(2026, 10, 25, 0, "Europe/London").getTime();
    const next = localTime(2026, 10, 26, 0, "Europe/London").getTime();
    expect((next - start) / 3_600_000).toBe(25);
  });

  it("falls back to UTC for anything invalid; ?tz= wins over the cookie", () => {
    expect(validTz("Mars/Olympus")).toBeNull();
    expect(validTz("x'; drop table")).toBeNull();
    expect(validTz("Asia/Karachi")).toBe("Asia/Karachi");
    expect(resolveTz(undefined, undefined)).toBe("UTC");
    expect(resolveTz("Nope/Nope", "Asia/Karachi")).toBe("Asia/Karachi");
    expect(resolveTz("Europe/London", "Asia/Karachi")).toBe("Europe/London");
    expect(resolveTz(["Europe/London"], "bad")).toBe("UTC");
  });

  it("adds days across months", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
