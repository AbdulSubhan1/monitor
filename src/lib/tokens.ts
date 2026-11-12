import { createHmac, timingSafeEqual } from "node:crypto";
import { findProject } from "@/lib/projects";

// A project's log token is "<projectId>.<HMAC-SHA256(secret, 'logs:' + projectId)>". Pulse keeps one secret and
// stores no tokens; each app holds only its own token, so a leaked token can't write logs as another project.

function signature(projectId: string, secret: string): string {
  return createHmac("sha256", secret).update(`logs:${projectId}`).digest("base64url");
}

export function logToken(projectId: string, secret: string): string {
  return `${projectId}.${signature(projectId, secret)}`;
}

// Returns the project id the token belongs to, or null
export function verifyLogToken(header: string | null, secret: string): string | null {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const projectId = token.slice(0, dot);
  if (!findProject(projectId)) return null;
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(projectId, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? projectId : null;
}

// Constant-time compare for the cron secret
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
