// The projects Pulse watches. Five sites never need an admin screen, so this list is code, reviewed in PRs.

export type Deploys =
  | { from: "vercel"; projectId: string }
  | { from: "github-pages"; repo: string };

export type Project = {
  id: string;
  name: string;
  url: string;
  // Path the uptime check requests. A redirect (3xx) counts as up: PolicyDesk sends visitors to its login page.
  checkPath: string;
  // Sites allowed to send beacon events for this project (the Origin header must match one)
  origins: string[];
  deploys: Deploys;
};

export const PROJECTS: Project[] = [
  {
    id: "portfolio",
    name: "Portfolio",
    url: "https://abdulsubhan1.github.io",
    checkPath: "/",
    origins: ["https://abdulsubhan1.github.io"],
    deploys: { from: "github-pages", repo: "AbdulSubhan1/abdulsubhan1.github.io" },
  },
  {
    id: "paysandbox",
    name: "PaySandbox",
    url: "https://paysandbox.vercel.app",
    checkPath: "/",
    origins: ["https://paysandbox.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_XfLGVOKTVXXgCmCionAl9FijRyeP" },
  },
  {
    id: "jobfit",
    name: "JobFit",
    url: "https://jobfit-tan.vercel.app",
    checkPath: "/",
    origins: ["https://jobfit-tan.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_U5DuOpqWHTXuPNsjrbq2BEcmPDBM" },
  },
  {
    id: "brokwise",
    name: "Brokwise",
    url: "https://brokwise.vercel.app",
    checkPath: "/health",
    origins: ["https://brokwise.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_oDSpPLNGJYxUfgdvRJLPC808fZq7" },
  },
  {
    id: "policydesk",
    name: "PolicyDesk",
    url: "https://policydesk-opal.vercel.app",
    checkPath: "/",
    origins: ["https://policydesk-opal.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_3G7KUgXElc6Ko6J3LvPdm7lQCoB5" },
  },
];

export const PROJECT_IDS = PROJECTS.map((p) => p.id) as [string, ...string[]];

export function findProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}
