import { describe, expect, it } from "vitest";
import { findRegressions, p75, type VitalsRow } from "@/lib/regressions";

const DEPLOY = new Date("2026-11-18T12:00:00Z");
const NOW = new Date("2026-11-26T12:00:00Z");
const FROM = new Date("2026-11-01T00:00:00Z");
const H = 3_600_000;

function loads(n: number, lcp: number, sideSign: -1 | 1): VitalsRow[] {
  return Array.from({ length: n }, (_, i) => ({ at: new Date(DEPLOY.getTime() + sideSign * (i + 1) * H), lcp }));
}

describe("p75", () => {
  it("matches percentile_cont(0.75)", () => {
    expect(p75([1, 2, 3, 4])).toBe(3.25);
    expect(p75([5])).toBe(5);
    expect(p75([])).toBeNull();
  });
});

describe("findRegressions (E4)", () => {
  const deploy = [{ at: DEPLOY, commit: "128b8e9" }];

  it("flags a metric 20% worse that crossed into a worse band, with 20 loads each side", () => {
    const r = findRegressions([...loads(20, 2000, -1), ...loads(20, 4600, 1)], deploy, FROM, NOW);
    expect(r).toEqual([{ metric: "lcp", commit: "128b8e9", at: DEPLOY, before: 2000, after: 4600 }]);
  });

  it("needs 20 loads on both sides", () => {
    expect(findRegressions([...loads(19, 2000, -1), ...loads(30, 4600, 1)], deploy, FROM, NOW)).toEqual([]);
  });

  it("ignores worse numbers that stay in the same band, or a small change across a band edge", () => {
    // 1.0 s -> 2.0 s: twice as slow but still good
    expect(findRegressions([...loads(20, 1000, -1), ...loads(20, 2000, 1)], deploy, FROM, NOW)).toEqual([]);
    // 2.4 s -> 2.6 s: crosses into needs work, but only 8% worse
    expect(findRegressions([...loads(20, 2400, -1), ...loads(20, 2600, 1)], deploy, FROM, NOW)).toEqual([]);
  });

  it("only looks at deploys inside the range", () => {
    expect(findRegressions([...loads(20, 2000, -1), ...loads(20, 4600, 1)], deploy, new Date("2026-11-20T00:00:00Z"), NOW)).toEqual([]);
  });
});
