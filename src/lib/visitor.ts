import { createHmac } from "node:crypto";

// A visitor: one browser on one device (address + user agent), per project. The hash is keyed, so it can't be read
// back or guessed without the secret; raw IP and user agent are never stored. It stays the same across days, so Pulse
// counts a person once per range and can tell a returning browser, never who it is. Hashes live only in raw events
// (deleted after 60 days); rollups hold counts. Changing the secret makes everyone a new visitor.
export function visitorHash(secret: string, project: string, ip: string, userAgent: string): string {
  return createHmac("sha256", secret).update(`${project}|${ip}|${userAgent}`).digest("base64url").slice(0, 16);
}

export function visitorSecret(): string {
  return process.env.VISITOR_SECRET || process.env.LOG_SIGNING_SECRET || "local-only";
}

// Crawlers, link previews and lab tools (Lighthouse, PageSpeed) are not people. A browser always sends a user agent.
const BOT = /bot|crawler|spider|crawling|headlesschrome|lighthouse|pagespeed|chrome-lighthouse|prerender|slurp|phantomjs/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT.test(userAgent);
}

// "?ref=LinkedIn Post" -> "linkedin-post": lowercase, only [a-z0-9._-], at most 40 characters
export function cleanSource(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s || null;
}
