import { describe, expect, it } from "vitest";
import { averageVisitMs, buildVisits, commonPaths, entriesAndExits, stepsOf, type VisitRow } from "@/lib/visits";

const at = (min: number) => new Date(Date.UTC(2026, 10, 21, 10, 0) + min * 60_000);
const page = (visitor: string, min: number, key: string): VisitRow => ({ visitor, at: at(min), kind: "page", key });

describe("buildVisits", () => {
  it("splits a visitor's pages on gaps of 30 minutes or more", () => {
    const visits = buildVisits([page("a", 0, "/"), page("a", 10, "/car"), page("a", 45, "/"), page("b", 1, "/")]);
    expect(visits.map((v) => [v.visitor, v.pages])).toEqual([
      ["a", ["/", "/car"]],
      ["a", ["/"]],
      ["b", ["/"]],
    ]);
  });

  it("adds sections and time to the visit they happened in, and never starts a visit with them", () => {
    const visits = buildVisits([
      { visitor: "a", at: at(-5), kind: "time", key: "/", value: 9_000 },
      page("a", 0, "/"),
      { visitor: "a", at: at(1), kind: "section", key: "projects" },
      { visitor: "a", at: at(2), kind: "time", key: "/", value: 60_000 },
    ]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ sections: ["projects"], timeMs: 60_000, hasTime: true });
  });
});

describe("paths", () => {
  it("collapses repeats and caps at 6 steps", () => {
    expect(stepsOf(["/", "/", "/a", "/a", "/b"])).toEqual(["/", "/a", "/b"]);
    expect(stepsOf(["1", "2", "3", "4", "5", "6", "7"])).toHaveLength(6);
  });

  it("ranks the most common paths and counts distinct visitors", () => {
    const visits = buildVisits([
      page("a", 0, "/car"),
      page("a", 1, "/car/plans"),
      page("b", 0, "/car"),
      page("b", 1, "/car/plans"),
      page("b", 50, "/car"),
      page("b", 51, "/car/plans"),
      page("c", 0, "/"),
      page("c", 1, "/about"),
      page("d", 0, "/"),
    ]);
    const { bySections, paths } = commonPaths(visits);
    expect(bySections).toBe(false);
    expect(paths[0]).toEqual({ steps: ["/car", "/car/plans"], visits: 3, visitors: 2 });
    expect(paths[1]).toEqual({ steps: ["/", "/about"], visits: 1, visitors: 1 });
  });

  it("uses the order of sections on a one-page site", () => {
    const rows: VisitRow[] = [
      page("a", 0, "/"),
      { visitor: "a", at: at(1), kind: "section", key: "hero" },
      { visitor: "a", at: at(2), kind: "section", key: "projects" },
    ];
    expect(commonPaths(buildVisits(rows))).toEqual({
      bySections: true,
      paths: [{ steps: ["hero", "projects"], visits: 1, visitors: 1 }],
    });
  });

  it("counts entries and exits, and averages time over timed visits only", () => {
    const visits = buildVisits([
      page("a", 0, "/"),
      page("a", 1, "/pay"),
      { visitor: "a", at: at(2), kind: "time", key: "/pay", value: 30_000 },
      page("b", 0, "/"),
    ]);
    const { entries, exits } = entriesAndExits(visits);
    expect(entries.get("/")).toBe(2);
    expect(exits.get("/pay")).toBe(1);
    expect(exits.get("/")).toBe(1);
    expect(averageVisitMs(visits)).toBe(30_000);
    expect(averageVisitMs([])).toBeNull();
  });
});
