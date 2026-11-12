# Engineering highlights

What Pulse does beyond "it works", and why. Pulse is a small monitor for my five live projects: uptime, a
cookie-free page-view beacon, an error and log endpoint, and one dashboard. Each item says the decision, why, and where
it lives and is tested.

## Architecture decisions

| Decision | Why | Where |
| --- | --- | --- |
| **Build it, don't rent it.** A self-built ingest on Neon Postgres instead of GTM, a pixel vendor or Axiom. | Five small sites don't need a vendor, and free plans add scripts, cookies and limits I can't control. Building the ingest shows the parts a vendor hides: input validation, auth for writes, privacy, retention. | whole repo |
| **Projects are code, not data.** | Five projects never need an admin screen, a projects table or a form. Adding one is a reviewed PR to one typed list. | `src/lib/projects.ts` |
| **Five tables, no deploys table.** | `checks`, `events`, `logs`, `vitals`, `api_calls` are the only things that must be stored. The last deploy is read live from the Vercel and GitHub APIs and cached 10 minutes, so it can never be stale or out of sync. | `src/server/db/schema.ts`, `src/server/deploys.ts` |
| **QStash as the scheduler (after GitHub Actions failed).** | Vercel Hobby crons run once a day; uptime needs every 10 minutes. The first try was a GitHub Actions schedule (free on a public repo), but GitHub's schedules are best effort: 45 minutes after setup it had not run once. An Upstash QStash schedule (free plan, 500 messages a day shared with PaySandbox; 144 used) now calls the check. It forwards our own `CRON_SECRET`, so the route keeps one auth check, and it is created by a protected `/api/cron/setup` route so the QStash token never leaves the server. No retries: a doubled check is worse than a missed one 10 minutes before the next. A missed slot still shows grey, not green. The GitHub workflow stays for manual runs. | `src/server/qstash.ts`, `src/app/api/cron/setup/route.ts`, `src/lib/slots.ts` |
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

## Interactions (every CTA)

- **Name + label.** An event name says what happened (`project_opened`, `plan_selected`), the label says which one or
  where (`policydesk`, `hero`). Names are a closed snake_case vocabulary; labels are free text up to 80 characters.
  The dashboard groups by both, so "which project do people open?" is one table, without inventing a name per project.
- **No code in the sites.** `data-pulse-event` + `data-pulse-label` on a link or button is enough; one delegated
  capture-phase click listener counts it, even if the click navigates away (sendBeacon survives unload).

## Performance (Core Web Vitals from real visitors)

- **Measured in the beacon with `PerformanceObserver`, no library:** LCP, INP, CLS, FCP and TTFB for each page load,
  sent once when the page is hidden (`visibilitychange` / `pagehide`), the moment Google's own library reports too.
- **CLS uses Google's session windows** (gaps under 1 s, windows up to 5 s, worst window wins), not a plain sum.
- **INP is simplified** to the slowest interaction; the real metric skips 1 in 50 interactions on very busy pages, which
  doesn't matter at this traffic. Written down so nobody mistakes it for the exact metric.
- **p75, like Google reports it,** with Postgres `percentile_cont(0.75)`, coloured by Google's good / needs work /
  poor thresholds; per project and per page. Client-side page changes share the hard load's numbers (known limit).
- **Impossible numbers are refused** (negative, over a minute, fractional ms), so one broken browser can't skew p75.

## API calls (the API log)

- **Reported by the calling app** to `POST /api/calls` with the same per-project token as logs: method, host, path,
  status, time, error. Batches of 1–50.
- **Routes, not URLs:** ids are replaced with `:id` on the server (UUIDs, numbers, long random tokens), so calls group
  by route and the log never stores a customer's id. Query strings are dropped.
- **Failed vs 4xx:** no response or 5xx counts as failed (the API's problem); 4xx is shown on its own (the caller's
  mistake). Avg and p95 time per route.
- **Public totals, private detail:** the route table is on the public project page; the call-by-call log with error
  text is under `/logs/api`, behind the same password as logs.

## Security monitoring (brute force)

- **What is watched:** failed and successful logins and blocks reported by apps (`POST /api/security`, same project
  token), plus attacks on Pulse itself: wrong `/logs` passwords, bad ingest tokens, bad cron secrets (project "pulse").
- **Rules, in sliding 15-minute windows** (so a burst split across a clock boundary still counts): 10 failures from
  one source; 5 failures on one account (from any sources); one source failing on 5 different accounts (password
  spraying); and a **critical** alert when an account signs in right after 5 failures (a guessed password). Blocks an
  app made itself are shown too. Rules are a pure function over recent events, unit tested.
- **No raw emails or IPs stored.** Accounts and sources are HMAC-SHA256 keyed hashes (the server secret is the key),
  so attempts group together but the values can't be read back or matched against a list. People see a masked hint
  (`ad***@policydesk.dev`). Reasons are a closed snake_case vocabulary, never free text, so a password can't slip in.
- **Pulse defends its own login.** After 10 failures from a source in 15 minutes, `/logs` and the token endpoints refuse
  that source without checking the password at all (even a correct one), until the window passes.
- **Public banner, private detail:** the overview shows only "N security alerts on PolicyDesk"; who and when is under
  `/logs/security`, behind the password.

## Protecting the free database

The Neon database is on the free plan, so no attack or bug may fill it or burn its compute:

| Layer | What | Cost to the database |
| --- | --- | --- |
| **Apps report less during an attack** | PolicyDesk reports the first 10 failures per source per 15 minutes, then one `login_blocked`, then nothing until the window ends: 100,000 guesses become about 11 rows. | ~11 rows per attacker per 15 min |
| **Rate limit on the public beacon** | 120 requests a minute per address, counted in memory before parsing. | none |
| **Blocked sources refused early** | Pulse's password and token checks refuse a blocked source in memory; the block is stored once per window. | 1 row per window |
| **Daily caps** | Per project per day: 5,000 events, 1,000 logs, 2,000 vitals, 5,000 API calls, 1,000 security events; 30,000 rows a day in total. Over a cap the request still gets 204 but nothing is written. Counts are cached for a minute, so checking a cap is not a query per request. | 0 writes over the cap |
| **Retention** | Everything older than 30 days is deleted on each uptime run. | bounded |
| **Own database** | Pulse's Neon database is separate from PolicyDesk's, so Pulse can never fill PolicyDesk's storage. | – |

Worst case (every cap hit every day) is about 4–5 MB a day, well under Neon's 0.5 GB with 30-day retention. Limits
kept in memory are per server instance; Vercel reuses warm instances, so they cut floods sharply but are not exact,
which the daily caps make up for.

## Uptime details

- `redirect: "manual"`: a 3xx is a healthy answer (PolicyDesk sends visitors to its login page). Up means status < 400.
- 10-second timeout per check, all projects in parallel; a timeout is stored as "timed out after 10s", not a status.
- Brokwise is checked on its `/health` route; the others on `/`.
- The 24-hour strip has one slot per 10 minutes. If two checks land in one slot, a failure wins.
