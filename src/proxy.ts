import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// The overview is public (it is a live portfolio demo). Logs carry error messages, so they need a password.
// Basic auth: one owner, no login page, no session table. Any user name works; only the password is checked.
export function proxy(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    // Locally there is nothing to protect; in production a missing password must lock the page, not open it
    return process.env.NODE_ENV === "production" ? new NextResponse("Logs are not configured.", { status: 503 }) : NextResponse.next();
  }
  const header = request.headers.get("authorization") ?? "";
  const decoded = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString() : "";
  const given = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const expected = Buffer.from(password);
  if (decoded.includes(":") && given.length === expected.length && timingSafeEqual(given, expected)) {
    return NextResponse.next();
  }
  return new NextResponse("Password needed.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Pulse logs"' } });
}

export const config = { matcher: ["/logs", "/logs/:path*"] };
