# Pulse

A small monitor for my own live projects, in one Next.js app: uptime checks, a cookie-free page-view beacon, an
error and log endpoint, and one dashboard. Think a tiny uptime robot + pixel + Axiom, for six sites.

**Live:** https://abdulsubhan-pulse.vercel.app

| Watches | URL |
| --- | --- |
| Portfolio | https://abdulsubhan1.github.io |
| PaySandbox | https://paysandbox.vercel.app |
| JobFit | https://jobfit-tan.vercel.app |
| RegRead | https://regread.vercel.app |
| Brokwise | https://brokwise.vercel.app |
| PolicyDesk | https://policydesk-opal.vercel.app |
| AgencyDesk | https://agencydesk-hazel.vercel.app |
| Radianzest | https://agency-us.vercel.app |
| Devxonic | https://agency-asia.vercel.app |

## What it does

- **Uptime:** every 10 minutes (an Upstash QStash schedule), each site is checked; status, code and response time are
  stored. The dashboard shows a 24-hour strip, uptime % and average response time.
- **Visitors, page views and interactions:** each site adds one script tag. It sends page views (including client-side
  navigation) with the link's source and the device type, every tagged click as a named event with a label
  (`project_opened` · `policydesk`, also middle-click and Ctrl/Cmd+click) and browser errors. Without any code it also
  tracks scroll depth, sections seen, links to other sites, downloads and visible time on page. Visitors are counted
  server-side with a keyed hash of project + IP + browser, kept 60 days: no cookies, no stored IP.
- **Sources:** add `?ref=linkedin` (or `utm_source`) to a link you share and Pulse shows "linkedin" as the source;
  otherwise the referring site, or "Unknown".
- **Performance:** the same script measures Core Web Vitals (LCP, INP, CLS, FCP, TTFB) for real visitors; the dashboard
  shows p75 per project and per page, coloured by Google's thresholds.
- **API calls:** app servers report each API call (method, route, status, time) to `/api/calls`; routes are grouped
  with ids as `:id`, with failed / 4xx counts, avg and p95.
- **Logs and errors:** app servers post errors and key logs to `/api/logs` with a per-project token. Next.js apps send
  every server error from `onRequestError`. A logs page filters by project and level (password protected).
- **Security (brute force):** apps report failed and successful logins; Pulse flags one source failing many times,
  one account guessed at, password spraying, and a sign-in right after many failures. Pulse also watches attacks on
  its own password and tokens. Emails and IPs are stored only as keyed hashes.
- **Free-database safe:** in-memory rate limits, daily row caps (3,000 events per project) and retention keep a flood
  from filling Neon: raw events 60 days, daily rollups 400 days (for 12 months), everything else 30 days. Bots and lab
  tools (crawlers, Lighthouse, PageSpeed, headless browsers) are dropped.
- **Dashboard in plain words:** one range per page (24 hours, 7 days, 30 days, 12 months) with the previous period
  for comparison, in the viewer's own timezone. Each screen opens with a one-line story slider (problems first; small
  numbers stay absolute; no verdict from too few samples), then project tabs: Overview, Traffic (pages, sources,
  common paths), Events, Performance (Core Web Vitals per page and device, daily trend, deploy markers and "got worse
  after deploy" checks), Uptime and API calls. A [guide](https://abdulsubhan-pulse.vercel.app/guide) explains every
  word. The stories are generic rules in `src/lib/stories.ts`; no project needs its own config.

## Add it to a site

```html
<script defer src="https://abdulsubhan-pulse.vercel.app/beacon.js" data-project="brokwise"></script>
```

```ts
window.pulse?.track("plan_selected", "Bluepeak Plus"); // snake_case name, optional label
```

```html
<a href="/cv.pdf" data-pulse-event="cv_downloaded" data-pulse-label="hero">Download CV</a> <!-- no code -->
```

Events tracked before the script loads can be queued: `(window.pulse ??= { q: [] }).q?.push("payment_succeeded")`.

Tracked with no code: `scroll_depth` (25/50/75/100), `section_viewed` (a `<section id>` or an element with
`data-pulse-section` at least half on screen for a second), `outbound_clicked` (another site's host),
`file_downloaded` (file name) and `time_on_page` (visible ms). At most 40 per page load. The dashboard shows them
apart, under "Tracked automatically"; "Events" counts only the ones the site tagged.

Share links with a source tag so Pulse can say where people came from (links with `rel="noreferrer"` hide it; use
`rel="noopener"`):

```html
<a href="https://brokwise.vercel.app?ref=portfolio" rel="noopener">Live demo</a>
```

Your own visits: open any tracked site once with `?pulse=ignore` (per site, per browser; stored in that site's
localStorage) and the beacon sends nothing; `?pulse=count` turns it back on. The guide has the links for every project.

API calls an app makes or serves (same per-project token as `/api/logs`, one call or a batch of up to 50):

```ts
await fetch("https://abdulsubhan-pulse.vercel.app/api/calls", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.MONITOR_LOG_TOKEN}` },
  body: JSON.stringify({ method: "GET", path: "/api/quotes/123", status: 200, ms: 184 }),
});
```

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

Type check, lint and unit tests (ingest validation, visitor hash, bot filter, sources, ranges and timezones, visits
and paths, the stories engine and its edge cases, vitals sample rule, deploy regressions, rollups against an
in-memory Postgres, tokens, uptime slots).

`VISITOR_SECRET` keys the visitor hash (falls back to `LOG_SIGNING_SECRET`); changing it makes every visitor new.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind 4, Drizzle ORM on Neon Postgres (free), PGlite locally, Zod, Vitest.
No chart or UI library: charts are SVG.

## Docs

- [Engineering highlights](docs/kb/engineering-highlights.md): every decision and why
- [Case study](docs/case-study.md)
- [Future scope](docs/kb/future-scope.md)
- [Plan](docs/plan.md)
