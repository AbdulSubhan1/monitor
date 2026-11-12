import { describe, expect, it } from "vitest";
import { BEACON_MAX_BYTES, cleanPath, parseBeacon, parseLogs } from "@/lib/ingest";

const BROKWISE = "https://brokwise.vercel.app";

describe("cleanPath", () => {
  it("drops query string and hash", () => {
    expect(cleanPath("/car/plans?token=abc#top")).toBe("/car/plans");
    expect(cleanPath("?x=1")).toBe("/");
    expect(cleanPath("pay")).toBe("/pay");
  });
});

describe("parseBeacon", () => {
  it("accepts a pageview from the project's own site and keeps only the referrer host", () => {
    const body = JSON.stringify({
      project: "brokwise",
      type: "pageview",
      path: "/car?email=a@b.c",
      referrer: "https://www.google.com/search?q=car+insurance",
    });
    expect(parseBeacon(body, BROKWISE)).toEqual({
      ok: true,
      value: { table: "events", project: "brokwise", type: "pageview", name: "pageview", path: "/car", referrer: "www.google.com" },
    });
  });

  it("stores a named event", () => {
    const body = JSON.stringify({ project: "brokwise", type: "event", name: "lead_submitted", path: "/car/details" });
    const parsed = parseBeacon(body, BROKWISE);
    expect(parsed.ok && parsed.value).toMatchObject({ table: "events", name: "lead_submitted", referrer: null });
  });

  it("turns a browser error into an error log", () => {
    const body = JSON.stringify({ project: "brokwise", type: "error", path: "/pay", message: "x is undefined", stack: "at f" });
    expect(parseBeacon(body, BROKWISE)).toEqual({
      ok: true,
      value: {
        table: "logs",
        project: "brokwise",
        level: "error",
        source: "browser",
        message: "x is undefined",
        path: "/pay",
        context: { stack: "at f" },
      },
    });
  });

  it("refuses another site's origin and a missing origin", () => {
    const body = JSON.stringify({ project: "brokwise", type: "pageview", path: "/" });
    expect(parseBeacon(body, "https://evil.example")).toMatchObject({ ok: false, status: 403 });
    expect(parseBeacon(body, "https://paysandbox.vercel.app")).toMatchObject({ ok: false, status: 403 });
    expect(parseBeacon(body, null)).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses unknown projects, unknown keys, bad event names and bad JSON", () => {
    const bad = [
      { project: "someone-else", type: "pageview", path: "/" },
      { project: "brokwise", type: "pageview", path: "/", userId: "u1" },
      { project: "brokwise", type: "event", name: "Lead Submitted!", path: "/" },
    ];
    for (const b of bad) expect(parseBeacon(JSON.stringify(b), BROKWISE)).toMatchObject({ ok: false, status: 400 });
    expect(parseBeacon("{not json", BROKWISE)).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses bodies over the size cap", () => {
    const body = JSON.stringify({ project: "brokwise", type: "pageview", path: "/", referrer: "x".repeat(BEACON_MAX_BYTES) });
    expect(parseBeacon(body, BROKWISE)).toMatchObject({ ok: false, status: 413 });
  });
});

describe("parseLogs", () => {
  it("accepts one log or a batch and cleans paths", () => {
    const one = parseLogs(JSON.stringify({ level: "error", message: "boom", path: "/api/x?id=1" }));
    expect(one).toEqual({ ok: true, value: [{ level: "error", message: "boom", path: "/api/x" }] });
    const batch = parseLogs(JSON.stringify([{ level: "info", message: "a" }, { level: "warn", message: "b" }]));
    expect(batch.ok && batch.value).toHaveLength(2);
  });

  it("refuses unknown levels, empty batches and batches over 20", () => {
    expect(parseLogs(JSON.stringify({ level: "fatal", message: "x" }))).toMatchObject({ ok: false, status: 400 });
    expect(parseLogs("[]")).toMatchObject({ ok: false, status: 400 });
    const many = Array.from({ length: 21 }, () => ({ level: "info", message: "x" }));
    expect(parseLogs(JSON.stringify(many))).toMatchObject({ ok: false, status: 400 });
  });
});
