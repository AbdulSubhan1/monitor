import { describe, expect, it } from "vitest";
import { BEACON_MAX_BYTES, cleanPath, parseBeacon, parseCalls, parseLogs, routeOf } from "@/lib/ingest";

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
      value: {
        table: "events",
        project: "brokwise",
        type: "pageview",
        name: "pageview",
        label: null,
        path: "/car",
        referrer: "www.google.com",
      },
    });
  });

  it("stores a named event", () => {
    const body = JSON.stringify({ project: "brokwise", type: "event", name: "lead_submitted", path: "/car/details" });
    const parsed = parseBeacon(body, BROKWISE);
    expect(parsed.ok && parsed.value).toMatchObject({ table: "events", name: "lead_submitted", label: null, referrer: null });
  });

  it("keeps an event's label, trimmed, and refuses an empty or long one", () => {
    const event = (label: string) =>
      JSON.stringify({ project: "brokwise", type: "event", name: "plan_selected", label, path: "/car/plans" });
    const parsed = parseBeacon(event("  Bluepeak Plus "), BROKWISE);
    expect(parsed.ok && parsed.value).toMatchObject({ name: "plan_selected", label: "Bluepeak Plus" });
    expect(parseBeacon(event("  "), BROKWISE)).toMatchObject({ ok: false, status: 400 });
    expect(parseBeacon(event("x".repeat(81)), BROKWISE)).toMatchObject({ ok: false, status: 400 });
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

describe("vitals", () => {
  it("stores one page load's metrics and leaves unmeasured ones empty", () => {
    const body = JSON.stringify({ project: "brokwise", type: "vitals", path: "/car?x=1", lcp: 1800, cls: 0.04, ttfb: 220 });
    expect(parseBeacon(body, BROKWISE)).toEqual({
      ok: true,
      value: { table: "vitals", project: "brokwise", path: "/car", lcp: 1800, inp: null, cls: 0.04, fcp: null, ttfb: 220 },
    });
  });

  it("refuses an empty report and impossible numbers", () => {
    const vitals = (m: object) => JSON.stringify({ project: "brokwise", type: "vitals", path: "/", ...m });
    expect(parseBeacon(vitals({}), BROKWISE)).toMatchObject({ ok: false, status: 400 });
    expect(parseBeacon(vitals({ lcp: -5 }), BROKWISE)).toMatchObject({ ok: false, status: 400 });
    expect(parseBeacon(vitals({ lcp: 90_000 }), BROKWISE)).toMatchObject({ ok: false, status: 400 });
    expect(parseBeacon(vitals({ inp: 12.5 }), BROKWISE)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("routeOf", () => {
  it("replaces ids with :id so calls group by route", () => {
    expect(routeOf("/api/website/v1/opportunities/0b0e3a5e-8f8d-4c3c-9a43-2b8f7c1d2e3f/plans?x=1")).toBe(
      "/api/website/v1/opportunities/:id/plans",
    );
    expect(routeOf("/orders/1234")).toBe("/orders/:id");
    expect(routeOf("/pay/Xk29aLq0pZr81mNbVt4w")).toBe("/pay/:id");
    expect(routeOf("/api/website/v1/opportunities")).toBe("/api/website/v1/opportunities");
    expect(routeOf("/payment-summary")).toBe("/payment-summary");
  });
});

describe("parseCalls", () => {
  it("accepts a batch, groups routes and keeps failures without a status", () => {
    const body = JSON.stringify([
      { method: "GET", host: "policydesk-opal.vercel.app", path: "/opportunities/42/plans", status: 200, ms: 180 },
      { method: "POST", path: "/opportunities", status: null, ms: 8000, error: "timed out" },
    ]);
    expect(parseCalls(body)).toEqual({
      ok: true,
      value: [
        { method: "GET", host: "policydesk-opal.vercel.app", route: "/opportunities/:id/plans", status: 200, ms: 180, error: null },
        { method: "POST", host: null, route: "/opportunities", status: null, ms: 8000, error: "timed out" },
      ],
    });
  });

  it("refuses unknown methods, bad statuses and batches over 50", () => {
    const call = (c: object) => JSON.stringify({ method: "GET", path: "/", status: 200, ms: 5, ...c });
    expect(parseCalls(call({ method: "BREW" }))).toMatchObject({ ok: false, status: 400 });
    expect(parseCalls(call({ status: 99 }))).toMatchObject({ ok: false, status: 400 });
    const many = Array.from({ length: 51 }, () => ({ method: "GET", path: "/", status: 200, ms: 5 }));
    expect(parseCalls(JSON.stringify(many))).toMatchObject({ ok: false, status: 400 });
  });
});
