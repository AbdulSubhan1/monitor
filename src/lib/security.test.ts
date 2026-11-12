import { describe, expect, it } from "vitest";
import { detectBruteForce, maskAccount, parseSecurity, type SecurityEvent } from "@/lib/security";

const T0 = Date.UTC(2026, 10, 12, 12, 0);
const ev = (minute: number, e: Partial<SecurityEvent>): SecurityEvent => ({
  project: "policydesk",
  type: "login_failed",
  source: "src-a",
  account: "acc-1",
  accountHint: "ad***@policydesk.dev",
  createdAt: new Date(T0 + minute * 60_000),
  ...e,
});

describe("parseSecurity", () => {
  it("accepts one event or a batch, and refuses unknown types, keys and free-text reasons", () => {
    expect(parseSecurity(JSON.stringify({ type: "login_failed", account: "a@b.c", ip: "1.2.3.4", reason: "wrong_password" }))).toMatchObject({ ok: true });
    expect(parseSecurity(JSON.stringify([{ type: "login_succeeded" }, { type: "login_blocked" }]))).toMatchObject({ ok: true });
    expect(parseSecurity(JSON.stringify({ type: "hacked" }))).toMatchObject({ ok: false, status: 400 });
    expect(parseSecurity(JSON.stringify({ type: "login_failed", password: "x" }))).toMatchObject({ ok: false, status: 400 });
    expect(parseSecurity(JSON.stringify({ type: "login_failed", reason: "Wrong password!" }))).toMatchObject({ ok: false, status: 400 });
  });
});

describe("maskAccount", () => {
  it("keeps two characters and the domain", () => {
    expect(maskAccount(" Ayesha.Khan@Example.com ")).toBe("ay***@example.com");
    expect(maskAccount("a@x.dev")).toBe("a***@x.dev");
    expect(maskAccount("admin")).toBe("ad***");
  });
});

describe("detectBruteForce", () => {
  it("stays quiet for a few ordinary mistakes", () => {
    expect(detectBruteForce([ev(0, {}), ev(1, {}), ev(2, { type: "login_succeeded" })])).toEqual([]);
  });

  it("flags 10 failures from one source inside 15 minutes, even across a clock boundary", () => {
    const burst = Array.from({ length: 10 }, (_, i) => ev(7 + i, { account: `acc-${i}`, accountHint: null }));
    const alerts = detectBruteForce(burst);
    expect(alerts.map((a) => a.kind)).toEqual(expect.arrayContaining(["one_source", "spraying"]));
    expect(alerts.find((a) => a.kind === "one_source")).toMatchObject({ count: 10 });
  });

  it("does not add up failures spread wider than the window", () => {
    const slow = Array.from({ length: 10 }, (_, i) => ev(i * 20, { account: `acc-${i}` }));
    expect(detectBruteForce(slow)).toEqual([]);
  });

  it("flags 5 failures on one account from different sources", () => {
    const guesses = Array.from({ length: 5 }, (_, i) => ev(i, { source: `src-${i}` }));
    expect(detectBruteForce(guesses)).toEqual([expect.objectContaining({ kind: "one_account", count: 5, accountHint: "ad***@policydesk.dev" })]);
  });

  it("raises a critical alert when an account signs in right after many failures", () => {
    const events = [...Array.from({ length: 5 }, (_, i) => ev(i, { source: `src-${i}` })), ev(6, { type: "login_succeeded" })];
    const [first] = detectBruteForce(events);
    expect(first).toMatchObject({ kind: "success_after_failures", severity: "critical", count: 5 });
  });

  it("shows blocks the app made itself", () => {
    expect(detectBruteForce([ev(0, { type: "login_blocked", account: null })])).toEqual([
      expect.objectContaining({ kind: "blocked", count: 1 }),
    ]);
  });
});
