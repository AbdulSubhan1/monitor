# Plan: Pulse, a small monitor for my live projects

Date: 2026-11-12. Scope agreed with Abdul: keep it basic.

## Goal

One app that watches my five live projects and nothing else:

| Project | Live URL | Checked URL | Deploys from |
| --- | --- | --- | --- |
| Portfolio | https://abdulsubhan1.github.io | `/` | GitHub Pages |
| PaySandbox | https://paysandbox.vercel.app | `/` | Vercel |
| JobFit | https://jobfit-tan.vercel.app | `/` | Vercel |
| Brokwise | https://brokwise.vercel.app | `/health` | Vercel |
| PolicyDesk | https://policydesk-opal.vercel.app | `/` (the 307 to login counts as up) | Vercel |

It does four small things, like a tiny GTM/pixel + Axiom + uptime robot in one place:

1. **Uptime.** Every 10 minutes, check each project's URL. Keep the result (up/down, status code, time in ms).
2. **Pageviews and events (the "pixel").** A small script tag (`/beacon.js`) each project adds. It sends page views,
   named events (for example `lead_submitted`) and browser errors.
3. **Logs and errors (the "Axiom" part).** One endpoint where an app's server sends errors and key logs, with a
   per-project token. A list with filters by project and level.
4. **One dashboard.** Each project's status, uptime, traffic for 24 h and 7 days, recent errors and last deploy.

## Out of scope (on purpose)

Alerts (email/Slack), unique visitors, sessions, funnels, multiple users, a log search language, tracing. Written up
in `docs/kb/future-scope.md` with what would trigger each one.

## Stack

Same as my other apps, no new libraries: Next.js 16 (App Router), TypeScript, Tailwind 4, Drizzle on Neon Postgres
(free, via the Vercel integration), PGlite for local dev, Zod for input, Vitest for unit tests. Charts are plain CSS bars.

## Design

- **Data:** three tables: `checks` (uptime), `events` (pageviews and named events), `logs` (server and browser
  errors and logs). Deploys are not stored: they are read from the Vercel and GitHub APIs and cached 10 minutes.
- **Projects are code, not data:** one typed list in `src/lib/projects.ts` (id, name, URL, check path, allowed
  origins, where it deploys). Five projects never need an admin screen.
- **Scheduler:** Vercel Hobby crons run only once a day, so a GitHub Actions schedule (free on a public repo) calls
  `POST /api/cron/check` every 10 minutes with a secret. The same call deletes data older than 30 days.
- **Beacon:** `navigator.sendBeacon` with a `text/plain` body, so there is no CORS preflight and it survives page
  unload. Sends the path without query string or hash. Hooks `pushState` for client-side navigation. No cookies, no
  IP stored, no fingerprinting.
- **Collect endpoint:** `POST /api/collect`. Checks the project id, that the `Origin` is one of that project's sites,
  body size (≤ 4 KB) and shape (Zod). Returns 204.
- **Log endpoint:** `POST /api/logs` with `Authorization: Bearer <token>`. The token is an HMAC of the project id
  with one server secret, so the monitor stores one secret, each app holds only its own token, and one leaked token
  can't write logs as another project.
- **Server errors in each app:** Next.js `onRequestError` in `instrumentation.ts` sends every server error with no
  code in each route. Short timeout, failures ignored, so the monitor can never break an app.
- **Privacy of the dashboard:** the overview (status, counts, deploys) is public, so it doubles as a live portfolio
  demo. The logs page shows messages, so it sits behind Basic auth (`DASHBOARD_PASSWORD`).

## Steps

1. Scaffold the repo (`~/monitor`, `main` + feature branch), DB schema, PGlite/Neon switch, setup script.
2. Ingest: `/api/collect`, `/api/logs`, `/beacon.js`, tokens, validation + unit tests.
3. Uptime: `/api/cron/check`, GitHub Actions schedule, retention. (Later moved to a QStash schedule: see the KB.)
4. Dashboard: overview cards, project page (uptime bars, pageviews per day, top pages and events), logs page with
   filters, Basic auth on logs.
5. Deploy: GitHub repo `AbdulSubhan1/monitor`, Vercel project under my personal team, Neon via the integration,
   env vars set without printing them, PR → `main`.
6. Wire two projects (PRs, not merged without asking): Portfolio (beacon) and Brokwise (beacon, `lead_submitted`
   event, server errors).
7. Docs: README, `docs/kb/` (README, engineering highlights, future scope), `docs/case-study.md`.

## Done means

- Pulse is live on Vercel.
- Portfolio and Brokwise send real pageviews and errors (after their PRs are merged), and the dashboard shows them.
- README and a case study note with the engineering decisions.
