import { TZ_COOKIE, validTz } from "@/lib/time";

// The "Change" form in the header posts here (a plain GET, no client JavaScript): a valid timezone is kept in a cookie
// for a year; an empty one clears it, so the page picks the browser's own again. Then back to where the viewer was.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("tz") ?? "";
  const back = url.searchParams.get("back") ?? "/";
  // Only a path on this site: never an open redirect
  const target = back.startsWith("/") && !back.startsWith("//") && !back.includes("\\") ? back : "/";
  const tz = validTz(raw);
  const cookie = tz
    ? `${TZ_COOKIE}=${encodeURIComponent(tz)}; Path=/; Max-Age=31536000; SameSite=Lax`
    : `${TZ_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  return new Response(null, { status: 303, headers: { Location: new URL(target, url.origin).href, "Set-Cookie": cookie } });
}
