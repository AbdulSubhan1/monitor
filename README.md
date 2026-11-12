# Pulse

A small monitor for my own live projects, in one Next.js app: uptime checks, a cookie-free page-view beacon, an
error and log endpoint, and one dashboard. Think a tiny uptime robot + pixel + Axiom, for five sites.

**Live:** https://abdulsubhan-pulse.vercel.app

| Watches | URL |
| --- | --- |
| Portfolio | https://abdulsubhan1.github.io |
| PaySandbox | https://paysandbox.vercel.app |
| JobFit | https://jobfit-tan.vercel.app |
| Brokwise | https://brokwise.vercel.app |
| PolicyDesk | https://policydesk-opal.vercel.app |

## What it does

- **Uptime:** every 10 minutes (GitHub Actions schedule), each site is checked; status, code and response time are
  stored. The dashboard shows a 24-hour strip, uptime % and average response time.
- **Page views and events:** each site adds one script tag. It sends page views (including client-side navigation),
  named events like `lead_submitted` and browser errors. No cookies, no ids, no IP stored.
- **Logs and errors:** app servers post errors and key logs to `/api/logs` with a per-project token. Next.js apps send
  every server error from `onRequestError`. A logs page filters by project and level (password protected).
- **Dashboard:** status, uptime, views for 24 h and 7 days, events, errors and the last deploy (Vercel and GitHub APIs).

## Add it to a site

```html
<script defer src="https://abdulsubhan-pulse.vercel.app/beacon.js" data-project="brokwise"></script>
```

```ts
window.pulse?.track("lead_submitted"); // snake_case names
```

```html
<a href="/cv.pdf" data-pulse-event="cv_downloaded">Download CV</a> <!-- counted on click, no code -->
```

Events tracked before the script loads can be queued: `(window.pulse ??= { q: [] }).q?.push("payment_succeeded")`.

Server errors in a Next.js app (`instrumentation.ts`):

```ts
export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  await fetch("https://abdulsubhan-pulse.vercel.app/api/logs", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MONITOR_LOG_TOKEN}` },
    body: JSON.stringify({ level: "error", message: String(error), path: request.path }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}
```

## Run it locally

```bash
npm install
```

```bash
npm run db:setup
```

```bash
npm run dev
```

No database to install: without `DATABASE_URL` it uses an embedded Postgres (PGlite) in `./.pglite`. Locally the
logs page is open and the beacon does nothing on `localhost`. See `.env.example` for the production variables.

```bash
npm run check
```

Type check, lint and unit tests (ingest validation, tokens, uptime slots).

## Stack

Next.js 16 (App Router), TypeScript, Tailwind 4, Drizzle ORM on Neon Postgres (free), PGlite locally, Zod, Vitest.
No chart or UI library: charts are SVG.

## Docs

- [Engineering highlights](docs/kb/engineering-highlights.md): every decision and why
- [Case study](docs/case-study.md)
- [Future scope](docs/kb/future-scope.md)
- [Plan](docs/plan.md)
