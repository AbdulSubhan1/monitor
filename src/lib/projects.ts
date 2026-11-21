// The projects Pulse watches. A handful of sites never need an admin screen, so this list is code, reviewed in PRs.

export type Deploys =
  | { from: "vercel"; projectId: string }
  | { from: "github-pages"; repo: string };

export type Project = {
  id: string;
  name: string;
  // "" while the site waits for its first deploy: it is left out of checks and pages until the URL is filled in
  url: string;
  // Path the uptime check requests. A redirect (3xx) counts as up: PolicyDesk sends visitors to its login page.
  checkPath: string;
  // Sites allowed to send beacon events for this project (the Origin header must match one)
  origins: string[];
  deploys: Deploys;
};

const ALL_PROJECTS: Project[] = [
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
    id: "regread",
    name: "RegRead",
    url: "https://regread.vercel.app",
    checkPath: "/",
    origins: ["https://regread.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_79PKaMWDFreaBVBcovLJBYogAqEC" },
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
  {
    id: "agencydesk",
    name: "AgencyDesk",
    url: "https://agencydesk-hazel.vercel.app",
    checkPath: "/",
    origins: ["https://agencydesk-hazel.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_AkDzcurpkS81oO0z0IqsEg0AAukn" },
  },
  {
    id: "agency-us",
    name: "Radianzest",
    url: "https://agency-us.vercel.app",
    checkPath: "/",
    origins: ["https://agency-us.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_DKTlTdU3XzzSwLSg03hrqI1uml1a" },
  },
  {
    id: "agency-asia",
    name: "Devxonic",
    url: "https://agency-asia.vercel.app",
    checkPath: "/",
    origins: ["https://agency-asia.vercel.app"],
    deploys: { from: "vercel", projectId: "prj_woRdWsurSgByNbieR0cpZmXF7aWW" },
  },
  {
    // Client shop (hair oil, cash on delivery). TODO when it is deployed: url, origins and the Vercel project id
    id: "zaitulhusn",
    name: "Zaitul Husn",
    url: "",
    checkPath: "/",
    origins: [],
    deploys: { from: "vercel", projectId: "" },
  },
];

export const PROJECTS = ALL_PROJECTS.filter((p) => p.url);

export const PROJECT_IDS = PROJECTS.map((p) => p.id) as [string, ...string[]];

export function findProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}
