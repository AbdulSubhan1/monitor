import { describe, expect, it } from "vitest";
import { formatMetric, rate } from "@/lib/vitals";

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
