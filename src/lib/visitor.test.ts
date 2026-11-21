import { describe, expect, it } from "vitest";
import { cleanSource, isBot, visitorHash } from "@/lib/visitor";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("visitorHash", () => {
  it("is stable within a day and project, and changes across days, projects and secrets", () => {
    const a = visitorHash("s", "2026-11-21", "brokwise", "1.2.3.4", CHROME);
    expect(a).toHaveLength(16);
    expect(visitorHash("s", "2026-11-21", "brokwise", "1.2.3.4", CHROME)).toBe(a);
    expect(visitorHash("s", "2026-11-22", "brokwise", "1.2.3.4", CHROME)).not.toBe(a);
    expect(visitorHash("s", "2026-11-21", "portfolio", "1.2.3.4", CHROME)).not.toBe(a);
    expect(visitorHash("t", "2026-11-21", "brokwise", "1.2.3.4", CHROME)).not.toBe(a);
    expect(visitorHash("s", "2026-11-21", "brokwise", "1.2.3.5", CHROME)).not.toBe(a);
  });

  it("never contains the raw address", () => {
    expect(visitorHash("s", "2026-11-21", "brokwise", "1.2.3.4", CHROME)).not.toContain("1.2.3.4");
  });
});

describe("isBot", () => {
  it("drops crawlers, lab tools and empty user agents", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36",
      "Mozilla/5.0 Chrome-Lighthouse",
      "Mozilla/5.0 (Linux) Chrome/120 Safari/537.36 PageSpeed",
      "Prerender (+https://github.com/prerender/prerender)",
      "some-crawler/1.0",
      "",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
    expect(isBot(null)).toBe(true);
  });

  it("keeps real browsers", () => {
    expect(isBot(CHROME)).toBe(false);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1")).toBe(false);
  });
});

describe("cleanSource", () => {
  it("lowercases, keeps [a-z0-9._-] and cuts at 40", () => {
    expect(cleanSource("Portfolio")).toBe("portfolio");
    expect(cleanSource("LinkedIn Post")).toBe("linkedin-post");
    expect(cleanSource("news.ycombinator_com")).toBe("news.ycombinator_com");
    expect(cleanSource("  !!  ")).toBeNull();
    expect(cleanSource(undefined)).toBeNull();
    expect(cleanSource("a".repeat(60))).toHaveLength(40);
  });
});
