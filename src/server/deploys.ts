import "server-only";
import type { Project } from "@/lib/projects";

// Last production deploy, read live from where each project deploys. Nothing is stored; answers are cached for
// 10 minutes so the dashboard never hammers either API. Any failure shows "unknown" instead of breaking the page.

const VERCEL_TEAM = "team_nGzbUAX6e6BSafa86CU2xnqa";
const CACHE = { next: { revalidate: 600 } };

export type Deploy = { at: Date; state: string; commit: string | null; message: string | null };

async function fromVercel(projectId: string): Promise<Deploy | null> {
  // Optional: without a token the card simply shows no deploy
  const token = process.env.VERCEL_TOKEN;
  if (!token) return null;
  const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=1&teamId=${VERCEL_TEAM}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, ...CACHE });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    deployments?: { created: number; state?: string; readyState?: string; meta?: Record<string, string> }[];
  };
  const d = data.deployments?.[0];
  if (!d) return null;
  return {
    at: new Date(d.created),
    state: (d.readyState ?? d.state ?? "unknown").toLowerCase(),
    commit: d.meta?.githubCommitSha?.slice(0, 7) ?? null,
    message: d.meta?.githubCommitMessage?.split("\n")[0] ?? null,
  };
}

async function fromGitHubPages(repo: string): Promise<Deploy | null> {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "PulseMonitor" };
  const res = await fetch(`https://api.github.com/repos/${repo}/deployments?environment=github-pages&per_page=1`, {
    headers,
    ...CACHE,
  });
  if (!res.ok) return null;
  const [d] = (await res.json()) as { sha: string; created_at: string; statuses_url: string }[];
  if (!d) return null;
  const statusRes = await fetch(`${d.statuses_url}?per_page=1`, { headers, ...CACHE });
  const [status] = statusRes.ok ? ((await statusRes.json()) as { state: string }[]) : [];
  return { at: new Date(d.created_at), state: status?.state ?? "unknown", commit: d.sha.slice(0, 7), message: null };
}

export async function getDeploy(project: Project): Promise<Deploy | null> {
  try {
    return project.deploys.from === "vercel"
      ? await fromVercel(project.deploys.projectId)
      : await fromGitHubPages(project.deploys.repo);
  } catch {
    return null;
  }
}
