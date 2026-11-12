import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureUptimeSchedule } from "@/server/qstash";

const fetchMock = vi.fn<typeof fetch>();
const ENV = { QSTASH_URL: "https://qstash.example/", QSTASH_TOKEN: "qs-token", CRON_SECRET: "cron-secret" };

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ensureUptimeSchedule", () => {
  it("upserts one schedule that POSTs the check every 10 minutes with our cron secret", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({ scheduleId: "pulse-uptime" }));
    await expect(ensureUptimeSchedule("https://pulse.example/api/cron/check", ENV)).resolves.toBe("pulse-uptime");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://qstash.example/v2/schedules/https://pulse.example/api/cron/check");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer qs-token");
    expect(headers.get("upstash-schedule-id")).toBe("pulse-uptime");
    expect(headers.get("upstash-cron")).toBe("*/10 * * * *");
    expect(headers.get("upstash-method")).toBe("POST");
    expect(headers.get("upstash-forward-authorization")).toBe("Bearer cron-secret");
  });

  it("refuses to run without its secrets and reports a QStash error", async () => {
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureUptimeSchedule("https://x", { ...ENV, QSTASH_TOKEN: "" })).rejects.toThrow("must be set");
    fetchMock.mockResolvedValue(new Response("no", { status: 401 }));
    await expect(ensureUptimeSchedule("https://x", ENV)).rejects.toThrow("QStash answered 401");
  });
});
