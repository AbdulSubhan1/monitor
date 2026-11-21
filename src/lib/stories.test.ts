import { describe, expect, it } from "vitest";
import type { MetricFacts, ProjectFacts } from "@/lib/facts";
import { readableName } from "@/lib/names";
import { resolveRange } from "@/lib/range";
import { buildStories, change, rank, storiesFor, tally, T, type Story } from "@/lib/stories";
import type { Metric } from "@/lib/vitals";

const NOW = new Date("2026-11-21T09:30:00Z");
const range = resolveRange("7d", NOW);
const home = { range, scope: { kind: "home" as const } };
const page = (id: string) => ({ range, scope: { kind: "project" as const, id } });

const noVitals = (): Record<Metric, MetricFacts> =>
  Object.fromEntries((["lcp", "inp", "cls", "fcp", "ttfb"] as Metric[]).map((m) => [m, { p75: null, samples: 0, prevP75: null, prevSamples: 0 }])) as Record<
    Metric,
    MetricFacts
  >;

function facts(over: Partial<ProjectFacts> & { id: string }): ProjectFacts {
  return {
    name: over.id.charAt(0).toUpperCase() + over.id.slice(1),
    dataStart: "2026-10-01",
    visitorsSince: "2026-10-01",
    status: { downNow: false, checks: 1008, failed: 0, failed24h: 0, uptime: 1, avgMs: 300 },
    views: 30,
    prevViews: 30,
    visitors: 10,
    prevVisitors: 10,
    events: 5,
    prevEvents: 5,
    buckets: [],
    sources: [],
    unknownViews: 0,
    views48h: 5,
    events48h: 1,
    eventsBefore48h: 4,
    eventsEver: 50,
    errors: 0,
    prevErrors: 0,
    vitals: noVitals(),
    regressions: [],
    api: null,
    referrals: [],
    outbound: [],
    topPage: null,
    pageCount: 1,
    topAction: null,
    topPath: null,
    record: null,
    ...over,
  };
}

const rules = (stories: Story[]) => stories.map((s) => s.id.split(":")[0]);
const find = (stories: Story[], rule: string) => stories.find((s) => s.id.split(":")[0] === rule);

describe("wording (D4)", () => {
  it("keeps small numbers absolute, says New after zero, percent only from a base of 20", () => {
    expect(change(4, 1, "view")).toBe("from 4 to 1");
    expect(change(0, 12, "view")).toBe("New: 12 views");
    expect(change(40, 10, "view")).toBe("down 75%, from 40 to 10");
    expect(change(20, 30, "view")).toBe("up 50%, from 20 to 30");
  });

  it("reads event names in plain words", () => {
    expect(readableName("quote_form_submitted")).toBe("Quote form sent");
    expect(readableName("scan_card_open")).toBe("Scan card opened");
    expect(readableName("nav_clicked")).toBe("Nav clicked");
    expect(readableName("scroll_depth")).toBe("How far people scroll");
  });
});

describe("rules (D1)", () => {
  it("site down now is red; old failures are amber, recent ones red", () => {
    const down = buildStories([facts({ id: "a", status: { downNow: true, checks: 10, failed: 1, failed24h: 1, uptime: 0.9, avgMs: 1 } })], page("a"));
    expect(find(down, "down")?.tone).toBe("red");
    const recent = buildStories([facts({ id: "a", status: { downNow: false, checks: 10, failed: 3, failed24h: 1, uptime: 0.7, avgMs: 1 } })], page("a"));
    expect(find(recent, "failing")?.tone).toBe("red");
    const old = buildStories([facts({ id: "a", status: { downNow: false, checks: 10, failed: 3, failed24h: 0, uptime: 0.7, avgMs: 1 } })], page("a"));
    expect(find(old, "failed-before")?.tone).toBe("amber");
    const two = buildStories([facts({ id: "a", status: { downNow: false, checks: 10, failed: 2, failed24h: 2, uptime: 0.8, avgMs: 1 } })], page("a"));
    expect(rules(two)).not.toContain("failing");
  });

  it("errors spike only from 5 and twice the period before; zero before says New", () => {
    expect(find(buildStories([facts({ id: "a", errors: 4, prevErrors: 0 })], page("a")), "errors")).toBeUndefined();
    expect(find(buildStories([facts({ id: "a", errors: 9, prevErrors: 5 })], page("a")), "errors")).toBeUndefined();
    const s = find(buildStories([facts({ id: "a", errors: 12, prevErrors: 0 })], page("a")), "errors");
    expect(s?.tone).toBe("red");
    expect(s?.line).toContain("New: 12 errors");
  });

  it("vitals: red only from 20 samples, amber hint from 5 to 19, nothing under 5", () => {
    const lcp = (p75: number, samples: number) => ({ ...noVitals(), lcp: { p75, samples, prevP75: null, prevSamples: 0 } });
    expect(find(buildStories([facts({ id: "a", vitals: lcp(24_600, 20) })], page("a")), "vitals-poor-lcp")?.tone).toBe("red");
    const hint = buildStories([facts({ id: "a", vitals: lcp(24_600, 6) })], page("a"));
    expect(rules(hint)).not.toContain("vitals-poor-lcp");
    expect(find(hint, "vitals-hint-lcp")?.tone).toBe("amber");
    expect(find(buildStories([facts({ id: "a", vitals: lcp(3_000, 6) })], page("a")), "vitals-hint-lcp")).toBeDefined();
    const few = rules(buildStories([facts({ id: "a", vitals: lcp(24_600, 4) })], page("a")));
    expect(few.filter((r) => r.startsWith("vitals"))).toEqual([]);
  });

  it("vitals recovered from poor to good with 20 samples on both sides", () => {
    const v = { ...noVitals(), inp: { p75: 150, samples: 25, prevP75: 700, prevSamples: 30 } };
    expect(find(buildStories([facts({ id: "a", vitals: v })], page("a")), "vitals-recovered-inp")?.tone).toBe("green");
    const thin = { ...noVitals(), inp: { p75: 150, samples: 25, prevP75: 700, prevSamples: 10 } };
    expect(find(buildStories([facts({ id: "a", vitals: thin })], page("a")), "vitals-recovered-inp")).toBeUndefined();
  });

  it("deploy regressions are red and name the commit and day", () => {
    const s = find(
      buildStories([facts({ id: "a", regressions: [{ metric: "lcp", commit: "128b8e9", at: new Date("2026-11-18T10:00:00Z"), before: 2000, after: 4600 }] })], page("a")),
      "vitals-regressed-lcp",
    );
    expect(s?.tone).toBe("red");
    expect(s?.title).toBe("LCP got worse after deploy 128b8e9 on 18 Nov");
  });

  it("tracking broke: views in 48 h, no events, events before", () => {
    expect(find(buildStories([facts({ id: "a", views48h: 3, events48h: 0, eventsBefore48h: 2 })], page("a")), "tracking-broke")?.tone).toBe("amber");
    expect(find(buildStories([facts({ id: "a", views48h: 0, events48h: 0, eventsBefore48h: 2 })], page("a")), "tracking-broke")).toBeUndefined();
  });

  it("no events set up from 20 views and never any event", () => {
    expect(find(buildStories([facts({ id: "a", views: 20, eventsEver: 0, eventsBefore48h: 0, events48h: 0 })], page("a")), "no-events")).toBeDefined();
    expect(find(buildStories([facts({ id: "a", views: 19, eventsEver: 0, eventsBefore48h: 0, events48h: 0 })], page("a")), "no-events")).toBeUndefined();
  });

  it("traffic fell or rose only from a previous period of 20 views", () => {
    expect(find(buildStories([facts({ id: "a", views: 10, prevViews: 20 })], page("a")), "traffic-fell")?.tone).toBe("amber");
    expect(find(buildStories([facts({ id: "a", views: 1, prevViews: 19 })], page("a")), "traffic-fell")).toBeUndefined();
    expect(find(buildStories([facts({ id: "a", views: 30, prevViews: 20 })], page("a")), "traffic-rose")?.tone).toBe("blue");
    // A new project: no previous period, never a "100% drop" or "+∞%"
    const fresh = buildStories([facts({ id: "a", views: 12, prevViews: 0, dataStart: "2026-11-20" })], page("a"));
    expect(rules(fresh)).not.toContain("traffic-fell");
    expect(rules(fresh)).not.toContain("traffic-rose");
    expect(fresh.map((s) => s.line).join(" ")).not.toMatch(/∞|100%/);
  });

  it("unknown sources from 60% of at least 10 views", () => {
    expect(find(buildStories([facts({ id: "a", views: 10, unknownViews: 6 })], page("a")), "unknown-source")).toBeDefined();
    expect(find(buildStories([facts({ id: "a", views: 9, unknownViews: 9 })], page("a")), "unknown-source")).toBeUndefined();
    expect(find(buildStories([facts({ id: "a", views: 10, unknownViews: 5 })], page("a")), "unknown-source")).toBeUndefined();
  });

  it("API slow or failing, from enough calls", () => {
    expect(find(buildStories([facts({ id: "a", api: { calls: 100, failed: 5, p95: 300 } })], page("a")), "api")).toBeDefined();
    expect(find(buildStories([facts({ id: "a", api: { calls: 100, failed: 0, p95: 2500 } })], page("a")), "api")).toBeDefined();
    expect(find(buildStories([facts({ id: "a", api: { calls: 100, failed: 4, p95: 1999 } })], page("a")), "api")).toBeUndefined();
    expect(find(buildStories([facts({ id: "a", api: { calls: 3, failed: 3, p95: 9000 } })], page("a")), "api")).toBeUndefined();
  });

  it("cross-site visitors, funnel finished and records are good news", () => {
    const s = buildStories(
      [
        facts({
          id: "a",
          referrals: [{ from: "b", name: "Bee", views: 2 }],
          topPath: { steps: ["/car", "/car/plans", "/car/thank-you"], visits: 4, visitors: 3, bySections: false, endsAtTopExit: true },
          record: { key: "2026-11-20", label: "20 Nov", views: 40 },
        }),
      ],
      page("a"),
    );
    expect(find(s, "cross-in-b")?.title).toBe("Bee sent 2 page views to A");
    expect(find(s, "funnel")?.title).toBe("3 visitors on A went all the way to /car/thank-you");
    expect(find(s, "record")?.tone).toBe("green");
    const short = buildStories([facts({ id: "a", topPath: { steps: ["/", "/x"], visits: 9, visitors: 9, bySections: false, endsAtTopExit: true } })], page("a"));
    expect(find(short, "funnel")).toBeUndefined();
  });

  it("no visitors is gray; a project with no data ever is waiting for the first visit", () => {
    expect(find(buildStories([facts({ id: "a", views: 0 })], page("a")), "no-visitors")?.tone).toBe("gray");
    expect(find(buildStories([facts({ id: "a", views: 0, dataStart: null })], page("a")), "waiting")?.title).toBe("A is waiting for the first visit");
    expect(find(buildStories([facts({ id: "a", views: 0, status: { downNow: true, checks: 1, failed: 1, failed24h: 1, uptime: 0, avgMs: null } })], page("a")), "no-visitors")).toBeUndefined();
  });

  it("always has one range summary, noting when data starts inside the range", () => {
    const s = buildStories([facts({ id: "a", dataStart: "2026-11-19", topPage: { path: "/", views: 20 } })], page("a"));
    const summary = find(s, "summary")!;
    expect(summary.tone).toBe("blue");
    expect(summary.line).toContain("Data starts 19 Nov.");
    expect(s.filter((x) => x.id.startsWith("summary"))).toHaveLength(1);
  });
});

describe("merge (D2), ranking (D3) and selection", () => {
  const sites = ["devxonic", "radianzest", "regread"].map((id) => facts({ id, views: 25, eventsEver: 0, events48h: 0, eventsBefore48h: 0 }));

  it("merges the same rule across projects on Home", () => {
    const s = buildStories(sites, home);
    const merged = find(s, "no-events")!;
    expect(merged.title).toBe("3 busy sites send no clicks: Devxonic, Radianzest and Regread");
    expect(merged.projects).toEqual(["devxonic", "radianzest", "regread"]);
    expect(s.filter((x) => x.id.startsWith("no-events"))).toHaveLength(1);
  });

  it("ranks by tone, then impact, then recency", () => {
    const mk = (id: string, tone: Story["tone"], impact: number, at = 0): Story => ({ id, tone, impact, at, title: id, line: "", link: "", href: "", projects: [], tab: "overview" });
    expect(rank([mk("g", "green", 99), mk("a1", "amber", 1), mk("r", "red", 0), mk("a2", "amber", 5), mk("b", "blue", 3, 2), mk("b2", "blue", 3, 9)]).map((s) => s.id)).toEqual([
      "r",
      "a2",
      "a1",
      "b2",
      "b",
      "g",
    ]);
  });

  it("shows at most 7 and filters by tab; counts the tally", () => {
    const many = Array.from({ length: 10 }, (_, i) => facts({ id: `p${i}`, errors: 10 + i, views: 0 }));
    const s = buildStories(many, home);
    expect(storiesFor(s)).toHaveLength(T.maxStories);
    const one = buildStories([facts({ id: "a", errors: 10, views: 25, eventsEver: 0, events48h: 0, eventsBefore48h: 0 })], page("a"));
    expect(storiesFor(one, "events").every((x) => x.tab === "events")).toBe(true);
    expect(tally(storiesFor(one))).toBe("1 problem · 1 to check · 1 update");
  });

  it("links carry the range and the tab", () => {
    const s = buildStories([facts({ id: "a", views: 10, unknownViews: 9 })], { range: resolveRange("30d", NOW), scope: { kind: "project", id: "a" } });
    expect(find(s, "unknown-source")?.href).toBe("/projects/a?tab=traffic&range=30d#fix");
  });

  it("returns nothing for an unknown project instead of inventing stories", () => {
    expect(buildStories([], page("missing"))).toEqual([]);
  });
});
