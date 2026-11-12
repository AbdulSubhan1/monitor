# Engineering highlights

What Pulse does beyond "it works", and why. Pulse is a small monitor for my five live projects: uptime, a
cookie-free page-view beacon, an error and log endpoint, and one dashboard. Each item says the decision, why, and where
it lives and is tested.

## Architecture decisions

| Decision | Why | Where |
| --- | --- | --- |
| **Build it, don't rent it.** A self-built ingest on Neon Postgres instead of GTM, a pixel vendor or Axiom. | Five small sites don't need a vendor, and free plans add scripts, cookies and limits I can't control. Building the ingest shows the parts a vendor hides: input validation, auth for writes, privacy, retention. | whole repo |
| **Projects are code, not data.** | Five projects never need an admin screen, a projects table or a form. Adding one is a reviewed PR to one typed list. | `src/lib/projects.ts` |
| **Three tables, no deploys table.** | `checks`, `events`, `logs` are the only things that must be stored. The last deploy is read live from the Vercel and GitHub APIs and cached 10 minutes, so it can never be stale or out of sync. | `src/server/db/schema.ts`, `src/server/deploys.ts` |
| **GitHub Actions as the scheduler.** | Vercel Hobby crons run once a day; uptime needs every 10 minutes. A scheduled workflow is free on a public repo and its runs are visible in the Actions tab. GitHub can start a run late, so a missed slot shows grey on the dashboard instead of being hidden. | `.github/workflows/uptime.yml`, `src/lib/slots.ts` |
| **Same stack as my other apps.** | Next.js 16, Drizzle, Neon, PGlite locally, Zod, Vitest: no new libraries. Charts are a few SVG rects. | `package.json`, `src/components/charts.tsx` |
| **Grouped queries.** | The overview runs four grouped queries for all projects (latest check with `DISTINCT ON`, `count(*) filter (...)` for 24 h and 7 d) instead of one set per project. Indexes on `(project, time)` match every query. | `src/server/queries.ts` |
| **Retention in the same call.** | Each uptime run also deletes data older than 30 days, so the free Neon storage never fills up and there is no second job to forget. | `src/server/uptime.ts` |

## Security

| What | Detail | Tested by |
| --- | --- | --- |
| **Beacon writes only from my sites** | `POST /api/collect` needs a known project id and an `Origin` that is one of that project's sites. A missing or foreign origin is refused (403). | `ingest.test.ts` |
| **Strict input, size caps** | Zod `strictObject`: unknown keys are refused. Event names must be snake_case (≤ 48 chars). Bodies over 4 KB (beacon) or 16 KB (logs) get 413; batches are 1–20 logs. | `ingest.test.ts` |
| **Per-project log tokens from one secret** | A token is `<project>.<HMAC-SHA256(secret, "logs:" + project)>`. Pulse stores one secret and no tokens; each app holds only its own token; a token moved to another project fails. Constant-time compare. A fixed test vector keeps tokens stable across deploys. | `tokens.test.ts` |
| **Cron secret** | `/api/cron/check` needs `Authorization: Bearer <CRON_SECRET>`, compared in constant time, refused when no secret is set. | `tokens.test.ts` |
| **Logs page behind a password** | The overview is public (it is a live portfolio demo); `/logs` shows messages, so it uses Basic auth in `proxy.ts`. In production a missing password locks the page instead of opening it. | `src/proxy.ts` |
| **Headers** | `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer. | `next.config.ts` |
| **Secrets never in chat or code** | Secrets are generated with `openssl rand` and piped straight into Vercel and GitHub; a project's log token is piped from `npm run -s log-token` into that app's env without being shown. | process |

## Privacy (the "pixel" part)

- **No cookies, no storage, no ids, no IP stored.** Pulse counts page views; it does not track people. That is also why
  there is no "unique visitors" number.
- **Paths without query string or hash**, cleaned in the beacon and again on the server: query strings carry tokens,
  emails and search terms.
- **Only the referring site's host** (`www.google.com`), never the full referrer URL.
- **My own test traffic stays out:** the beacon does nothing on localhost or in automated browsers
  (`navigator.webdriver`), so Playwright runs never count as visits.

## Reliability: the monitor can't break the apps

- The beacon uses `navigator.sendBeacon` with a `text/plain` body: no CORS preflight, it survives page unload, and it
  never blocks rendering (`defer`). If Pulse is down, the sites don't notice.
- Server errors are sent from Next.js `onRequestError` with a 2-second timeout and every failure ignored.
- At most 5 browser errors per page load, so one broken loop can't flood the log. "Script error." (another origin's
  script, no detail) is dropped.
- **Click events without code (the "GTM trigger" part):** any element with `data-pulse-event="name"` is counted on
  click through one delegated listener, so a static site can track its CV download with an attribute.
- **No lost early events:** an app can push event names to `window.pulse.q` before the script loads; the beacon sends
  them when it starts.
- Client-side navigations count: the beacon hooks `history.pushState` and `popstate`, and skips repeats of the same path.

## Uptime details

- `redirect: "manual"`: a 3xx is a healthy answer (PolicyDesk sends visitors to its login page). Up means status < 400.
- 10-second timeout per check, all projects in parallel; a timeout is stored as "timed out after 10s", not a status.
- Brokwise is checked on its `/health` route; the others on `/`.
- The 24-hour strip has one slot per 10 minutes. If two checks land in one slot, a failure wins.
