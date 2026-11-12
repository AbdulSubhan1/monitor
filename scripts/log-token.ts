/**
 * Prints a project's log token to stdout, for piping straight into that app's env without showing it:
 *   LOG_SIGNING_SECRET=... npm run -s log-token -- brokwise | vercel env add MONITOR_LOG_TOKEN production
 */
import { findProject } from "@/lib/projects";
import { logToken } from "@/lib/tokens";

const projectId = process.argv[2];
const secret = process.env.LOG_SIGNING_SECRET;
if (!projectId || !findProject(projectId)) {
  console.error("Usage: npm run -s log-token -- <project id from src/lib/projects.ts>");
  process.exit(1);
}
if (!secret) {
  console.error("LOG_SIGNING_SECRET is not set.");
  process.exit(1);
}
process.stdout.write(logToken(projectId, secret));
