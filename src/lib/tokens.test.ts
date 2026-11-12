import { describe, expect, it } from "vitest";
import { bearerMatches, logToken, verifyLogToken } from "@/lib/tokens";

const SECRET = "test-secret";

describe("log tokens", () => {
  it("round-trips and names the project", () => {
    expect(verifyLogToken(`Bearer ${logToken("brokwise", SECRET)}`, SECRET)).toBe("brokwise");
  });

  it("keeps a fixed value, so an app's token stays valid across deploys", () => {
    expect(logToken("brokwise", SECRET)).toBe("brokwise.vG4dEtC8TxD1Uszi9OC0OSIxjRXgcI6CqQnqUKU8gBE");
  });

  it("refuses a token moved to another project, a wrong secret, unknown projects and junk", () => {
    const sig = logToken("brokwise", SECRET).split(".")[1];
    expect(verifyLogToken(`Bearer policydesk.${sig}`, SECRET)).toBeNull();
    expect(verifyLogToken(`Bearer ${logToken("brokwise", "other")}`, SECRET)).toBeNull();
    expect(verifyLogToken(`Bearer ${logToken("someone", SECRET)}`, SECRET)).toBeNull();
    expect(verifyLogToken(logToken("brokwise", SECRET), SECRET)).toBeNull();
    expect(verifyLogToken(null, SECRET)).toBeNull();
    expect(verifyLogToken("Bearer .", SECRET)).toBeNull();
  });
});

describe("bearerMatches", () => {
  it("matches only the exact secret, and never when no secret is set", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer ", undefined)).toBe(false);
  });
});
