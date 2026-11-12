import "server-only";
import { verifyLogToken } from "@/lib/tokens";
import { notePulseAuthFailure, pulseSourceBlocked } from "@/server/security";

// The token check shared by the server-to-server endpoints. A source that keeps sending bad tokens is refused before
// any check, and its attempts show up on the security page as attempts on Pulse itself.
export async function projectFromToken(request: Request): Promise<{ project: string } | { response: Response }> {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return { response: Response.json({ error: "not configured" }, { status: 503 }) };
  if (await pulseSourceBlocked(request)) return { response: Response.json({ error: "too many attempts" }, { status: 429 }) };
  const project = verifyLogToken(request.headers.get("authorization"), secret);
  if (!project) {
    await notePulseAuthFailure(request, "bad_token");
    return { response: Response.json({ error: "invalid token" }, { status: 401 }) };
  }
  return { project };
}
