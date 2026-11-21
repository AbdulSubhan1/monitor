import { cookies } from "next/headers";
import { TzSync } from "@/components/tz-sync";
import { resolveTz, TZ_COOKIE, validTz } from "@/lib/time";

// The viewer's timezone for this request: ?tz= (this request only), then the cookie, then UTC
export async function viewerTz(param: string | string[] | undefined): Promise<{ tz: string; hasCookie: boolean }> {
  const cookie = (await cookies()).get(TZ_COOKIE)?.value;
  return { tz: resolveTz(param, cookie), hasCookie: validTz(cookie) !== null };
}

let zones: string[] | null = null;
function allZones(): string[] {
  zones ??= ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")];
  return zones;
}

// "Times in Asia/Karachi · Change": a small GET form, no client JavaScript; the first visit takes the browser's zone
export function TimezoneControl({ tz, hasCookie, back }: { tz: string; hasCookie: boolean; back: string }) {
  return (
    <>
      {!hasCookie && <TzSync />}
      <details className="inline">
        <summary className="inline cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          Times in {tz} · <span className="underline">Change</span>
        </summary>
        <form action="/api/tz" method="get" className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="back" value={back} />
          <label htmlFor="tz-select" className="sr-only">
            Timezone
          </label>
          <select id="tz-select" name="tz" defaultValue={tz} className="min-h-11 max-w-64 rounded-lg border border-line bg-card px-2 text-[13px] text-ink">
            {allZones().map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <button type="submit" className="min-h-11 rounded-full bg-ink px-4 text-[13px] text-paper">
            Use this
          </button>
          <button type="submit" name="tz" value="" className="min-h-11 px-2 text-[13px] text-muted underline hover:text-ink">
            Use my browser&apos;s
          </button>
        </form>
      </details>
    </>
  );
}
