import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {}, schema: {} }));

const { keyedHash, rateLimited } = await import("@/server/guard");

describe("rateLimited", () => {
  it("lets the limit through, refuses the next one, and forgets old hits", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimited("test|a", 3, 60_000, now + i)).toBe(false);
    expect(rateLimited("test|a", 3, 60_000, now + 10)).toBe(true);
    expect(rateLimited("test|b", 3, 60_000, now + 10)).toBe(false);
    expect(rateLimited("test|a", 3, 60_000, now + 61_000)).toBe(false);
  });
});

describe("keyedHash", () => {
  it("groups the same value however it is typed, and keeps kinds apart", () => {
    expect(keyedHash("account", "Ayesha@Example.com ")).toBe(keyedHash("account", "ayesha@example.com"));
    expect(keyedHash("account", "1.2.3.4")).not.toBe(keyedHash("source", "1.2.3.4"));
    expect(keyedHash("source", "1.2.3.4")).toHaveLength(16);
  });
});
