import { describe, expect, it } from "vitest";
import { confidence, formatMetric, rate, scalePosition, shownRating } from "@/lib/vitals";

describe("rate", () => {
  it("uses Google's thresholds, inclusive at the good edge", () => {
    expect(rate("lcp", 2500)).toBe("good");
    expect(rate("lcp", 2501)).toBe("needs-work");
    expect(rate("lcp", 4001)).toBe("poor");
    expect(rate("cls", 0.1)).toBe("good");
    expect(rate("cls", 0.3)).toBe("poor");
    expect(rate("inp", null)).toBe("none");
  });
});

describe("formatMetric", () => {
  it("shows seconds from 1 s, ms below, and CLS without a unit", () => {
    expect(formatMetric("lcp", 1840)).toBe("1.8 s");
    expect(formatMetric("inp", 96.4)).toBe("96 ms");
    expect(formatMetric("cls", 0.0412)).toBe("0.04");
    expect(formatMetric("ttfb", null)).toBe("–");
  });
});

describe("sample rule", () => {
  it("gives a verdict from 20 loads, an early hint from 5, nothing below", () => {
    expect(confidence(20)).toBe("verdict");
    expect(confidence(19)).toBe("hint");
    expect(confidence(5)).toBe("hint");
    expect(confidence(4)).toBe("few");
  });

  it("never shows poor from an early hint, and no rating from too few loads", () => {
    expect(shownRating("lcp", 24_600, 25)).toEqual({ rating: "poor", confidence: "verdict" });
    expect(shownRating("lcp", 24_600, 6)).toEqual({ rating: "needs-work", confidence: "hint" });
    expect(shownRating("lcp", 24_600, 2)).toEqual({ rating: "none", confidence: "few" });
    expect(shownRating("lcp", 1_000, 6)).toEqual({ rating: "good", confidence: "hint" });
  });

  it("places values on the good / needs work / poor scale", () => {
    expect(scalePosition("lcp", 2500)).toBe(40);
    expect(scalePosition("lcp", 4000)).toBe(64);
    expect(scalePosition("lcp", 60_000)).toBe(99);
  });
});
