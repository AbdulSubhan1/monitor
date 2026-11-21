import "server-only";
import type { Project } from "@/lib/projects";

// Production deploys, read live from where each project deploys: the last one for the cards, and up to 20 for the speed
// trend's markers and the "worse after a deploy" check. Nothing is stored; answers are cached for 10 minutes so the
// dashboard never hammers either API. Any failure shows "unknown" (or no markers) instead of breaking the page.

const VERCEL_TEAM = "team_nGzbUAX6e6BSafa86CU2xnqa";
const CACHE = { next: { revalidate: 600 } };

export type Deploy = { at: Date; state: string; commit: string | null; message: string | null };

export const DEPLOY_HISTORY = 20;
const GITHUB_HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "AbdulSubhan-Pulse" };

async function fromVercel(projectId: string): Promise<Deploy[]> {
  // Optional: without a token the card simply shows no deploy
  const token = process.env.VERCEL_TOKEN;
  if (!token) return [];
  const url = `https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=${DEPLOY_HISTORY}&teamId=${VERCEL_TEAM}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, ...CACHE });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    deployments?: { created: number; state?: string; readyState?: string; meta?: Record<string, string> }[];
  };
  return (data.deployments ?? []).map((d) => ({
    at: new Date(d.created),
    state: (d.readyState ?? d.state ?? "unknown").toLowerCase(),
    commit: d.meta?.githubCommitSha?.slice(0, 7) ?? null,
    message: d.meta?.githubCommitMessage?.split("\n")[0] ?? null,
  }));
}

async function fromGitHubPages(repo: string): Promise<Deploy[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/deployments?environment=github-pages&per_page=${DEPLOY_HISTORY}`, {
    headers: GITHUB_HEADERS,
    ...CACHE,
  });
  if (!res.ok) return [];
  const list = (await res.json()) as { sha: string; created_at: string; statuses_url: string }[];
  if (!list.length) return [];
  // Only the latest deploy's state is shown, so only its status is fetched
  const statusRes = await fetch(`${list[0].statuses_url}?per_page=1`, { headers: GITHUB_HEADERS, ...CACHE });
  const [status] = statusRes.ok ? ((await statusRes.json()) as { state: string }[]) : [];
  return list.map((d, i) => ({ at: new Date(d.created_at), state: i === 0 ? (status?.state ?? "unknown") : "unknown", commit: d.sha.slice(0, 7), message: null }));
}

// Newest first; empty when unknown
export async function getDeploys(project: Project): Promise<Deploy[]> {
  try {
    const list = project.deploys.from === "vercel" ? await fromVercel(project.deploys.projectId) : await fromGitHubPages(project.deploys.repo);
    return list.sort((a, b) => b.at.getTime() - a.at.getTime());
  } catch {
    return [];
  }
}

export async function getDeploy(project: Project): Promise<Deploy | null> {
  return (await getDeploys(project))[0] ?? null;
}
