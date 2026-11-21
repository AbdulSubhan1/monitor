# Requirements: Pulse insights redesign

Date: 2026-11-21. Agreed with Abdul over a design review. This document is the source of truth for the build: where it
is silent or unclear, **ask, do not assume** (see "How to work on this" at the end).

Design canvas (6 screens, clickable, real data from 21 Nov):
https://claude.ai/artifact/QnkPdQmwHymCTmHXMHbVD4 — read it with the Artifact tool. It shows the look; this document
says how it behaves. Where they differ, this document wins and the difference is worth a question.

---

## 1. Why

Abdul opened Pulse as a first-time user and could not read it. The numbers looked wrong and nothing explained them.
The analysis of the live data (7 days to 21 Nov) found these causes:

| What Abdul saw | Real cause |
| --- | --- |
| Portfolio "18 visits" but only 2–3 events | The 18 are **page views**, not people. Pulse has no visitor count at all. Most portfolio visitors read and scroll, and scrolling is not tracked. |
| Stats row mixed "Views 7 days" with "Events 24 h" | Different windows side by side on the project page and cards. Every number must use one range. |
| Brokwise 17 views, but the portfolio sent it 1 click | One Brokwise visit opens ~5 pages (`/car` → details → plans → payment → thank-you). 17 views ≈ 3 people, most likely Abdul testing. His own visits are counted. |
| Can't tell where Brokwise visitors came from | Portfolio links use `rel="noreferrer"`, so the browser sends no referrer. 14 of 17 views are "unknown". |
| Some clicks missing | The beacon only listens to `click`. Middle-click / Ctrl+click / "open in new tab" are missed. |
| No 30-day or 12-month view | Ranges are fixed at 24 h / 7 d and every table drops rows older than 30 days (`RETENTION_DAYS` in `src/server/uptime.ts`). |
| RegRead LCP 24.6 s marked as a fact | p75 from very few page loads. There is no minimum sample size. |

## 2. Principles (apply to every requirement)

1. **Generic.** Nothing in the dashboard knows a project by name. Every project gets the same tabs, ranges, stories and
   automatic tracking. Adding a project stays: one entry in `src/lib/projects.ts` + one script tag. No per-project
   funnel or goal config.
2. **Plain words first.** Every screen leads with a short sentence-level story; numbers are the detail. Every number has
   a one-line meaning under it. Technical names (LCP, `quote_form_submitted`) are shown second, small.
3. **Lean.** No duplicated information, no collapsed boxes that hide content, no decoration. Abdul rejected: two
   stacked text boxes, a large graphic panel inside the slider, boxed control buttons, a `<details>` at the page end.
4. **One range per page.** The chosen range applies to every number, chart and story on that page, and to links.
5. **Honest numbers.** Never show "0" when data failed to load, never "+∞%", never "100% drop" for a new project,
   never a red verdict from a handful of samples.
6. **Privacy as today.** No cookies, no stored IP, no user id. Anything that groups visitors is a keyed hash that
   rotates daily.
7. **Free database safe.** Neon free tier (0.5 GB). Rate limits and daily caps stay; new data must fit (see §5.4).
8. **No new UI or chart library.** SVG and Tailwind like today.

## 3. Scope at a glance

| Part | What |
| --- | --- |
| A. Beacon | Visitors, sources (`?ref=`), automatic events, every kind of click, time on page, device, owner opt-out, bot filter |
| B. Data | New columns + migration, daily rollups for long ranges, retention changes, range queries with previous period |
| C. Dashboard | Range selector everywhere, project tabs, redesigned home and tabs, story slider |
| D. Stories engine | Generic rules that turn data into stories, with ranking and edge cases |
| E. Web vitals watching | Sample thresholds, daily trend, regressions tied to deploys, per page and device |
| F. Guide | "How to read Pulse" page, owner opt-out flow, empty states |

Out of scope here: the Portfolio repo change (`noreferrer` → `noopener` + `?ref=portfolio`) — it lives in another repo,
see §10. Alerts outside the dashboard (email/Telegram) — open question Q2.

---

## 4. A. Beacon (`public/beacon.js`)

Keep it one small dependency-free file, ES5-safe like today, no cookies, no storage except the opt-out flag (A7).

**A1. Every kind of click.** Tagged elements (`data-pulse-event`) count on `click` and on `auxclick` (middle button).
Ctrl/Cmd/Shift+click already fire `click`; make sure they are not filtered out. A long-press "open in new tab" on mobile
cannot be detected; document that in the Guide FAQ.

**A2. Automatic events (every site, no code).** Reserved names, so the UI can group them as "Tracked automatically":

| Name | Label | When | Limit |
| --- | --- | --- | --- |
| `scroll_depth` | `25` / `50` / `75` / `100` | First time the page passes that depth | Once per depth per page view |
| `section_viewed` | element id | An element with `id` that is a `<section>`, or has `data-pulse-section`, is ≥50% on screen for ≥1 s | Once per section per page view |
| `outbound_clicked` | destination host | Click/auxclick on a link to another origin that has no `data-pulse-event` | — |
| `file_downloaded` | file name | Click on a link with `download` or ending in pdf, zip, docx, xlsx, csv, png, jpg, mp4 and no `data-pulse-event` | — |
| `time_on_page` | — (value in ms, see B1) | On page hide / client navigation, visible time only (pause while the tab is hidden) | Once per page view |

A tagged element keeps its own name; automatic events never double-count it. Pages shorter than the viewport count as
100% scrolled once. Per page load, at most 40 automatic events (protects the daily cap).

**A3. Source.** On the first page view of a load, read `ref`, then `utm_source`, from the query string (before the path
is cleaned) and send it as `source` (lowercase, `[a-z0-9._-]`, ≤40 chars). The server stores the referrer host as today
plus this source. Shown as one "Where visitors came from" list: `source` wins over referrer host when both exist.

**A4. Device.** Send `device: "mobile" | "desktop"` (viewport width < 768 px or `pointer: coarse` → mobile) on page
views and vitals.

**A5. Bots.** The server drops beacon posts whose User-Agent matches common bots and lab tools (Googlebot, bingbot,
other `bot|crawler|spider`, `HeadlessChrome`, `Lighthouse`, `PageSpeed`, `Chrome-Lighthouse`, `Prerender`). Keep the
existing `navigator.webdriver` and localhost skip.

**A6. Visitors (server side, in `/api/collect`).** `visitor = HMAC(secret, day + project + ip + user-agent)` truncated
to 16 chars, stored on page views and events. `day` is the local day in the dashboard timezone (Q1). The secret is a
new env var `VISITOR_SECRET` (fallback to `LOG_SIGNING_SECRET`). Raw IP and UA are never stored. The same person counts
once per day per project; across days they are different visitors (documented as "daily visitors").

**A7. Owner opt-out ("Don't count me").** Opening any tracked site with `?pulse=ignore` sets `localStorage["pulse:ignore"]="1"`
on that site's origin; `?pulse=count` removes it. While set, the beacon sends nothing. Note: localStorage is per
origin, so the Pulse dashboard **cannot** set it for other sites. The Guide therefore shows one "Don't count me on
<project>" link per project (opening `<url>?pulse=ignore`) and a "Count me again" link. The flag read must be wrapped
in try/catch (private mode).

**A8. Payload limits.** Extend the Zod schemas in `src/lib/ingest.ts` (strict objects as today). Unknown fields are
still rejected. Event names stay snake_case.

## 5. B. Data

**B1. Schema (new migration `drizzle/0003_*`).**
- `events`: add `visitor text`, `source text`, `device text`, `value integer` (ms for `time_on_page`).
- `vitals`: add `device text`.
- Indexes for the new queries where needed (e.g. `(project, created_at, visitor)`).
- Update `drizzle/meta` via `npm run db:generate`; `npm run db:setup` must migrate PGlite and Neon.

**B2. Visits (computed, not stored).** A visit = page views with the same `visitor` and project, gaps < 30 min.
Entry page = first page of a visit, exit page = last. Common paths = most frequent ordered page sequences of visits
(collapse consecutive duplicates, cap at 6 steps, top 3). On a one-page site use `section_viewed` order instead.

**B3. Ranges.** `24h` (hourly buckets), `7d` and `30d` (daily), `12m` (monthly). Each range also returns the previous
period of equal length for comparisons. Range is a URL search param (`?range=7d`, default `7d`) so every view is
shareable and server-rendered like today's chips.

**B4. Retention and rollups (free tier).** Raw `events` kept 60 days (was 30). A daily rollup table
(`daily_stats`: project, day, kind [page/event/source/device], key, label, views, visitors, events, value_sum) is
written by the existing 10-minute cron for completed days and kept 400 days. 24h/7d/30d read raw rows; 12m reads
rollups. Other tables keep 30 days. Keep daily caps; add the rollup table to the size estimate in `guard.ts` comments.
If you think rollups are not worth it, ask before choosing another approach (Q5).

**B5. Days in one timezone.** Bucketing, "today", rollup days and the visitor hash day use the dashboard timezone (Q1),
not UTC as today.

## 6. C. Dashboard

Reference: the design canvas. Same palette, fonts and components as today (`globals.css`, `Stat`, `Chip`).

**C1. Range selector** on Home and every project tab: 24 hours · 7 days · 30 days · 12 months, top right, as links.
The subtitle states the range in words ("Last 7 days · 15–21 Nov · every number below uses this range").

**C2. Home.**
- Headline status ("All 9 projects are up" / "X is down").
- Story slider (D) with stories across all projects.
- Project grid, busiest first. Card: name, host, Up/Down pill, Visitors · Page views · Events for the range, a per-day
  mini bar chart, and one plain sentence about that project (the top story for it, or a neutral fallback).
- Projects with zero page views in the range are **quiet cards** at the end of the same grid: dashed border, light
  background, "No visitors this week", one line "Nobody opened it, or the Pulse script is missing", link to the Guide's
  script check. No separate box for them.

**C3. Project page** = header (name, status pill with uptime %, site link, range) + tabs as links with `?tab=`:
Overview · Traffic · Events · Performance · Uptime · API calls. The tab bar wraps on small screens and must not show a
scrollbar (no `overflow` on it). Each tab starts with the story slider filtered to that project and tab.

- **Overview:** 4 stat cards with meaning lines (Visitors, Page views, Events, Avg time on site); visitors + page views
  per bucket chart; Most common path; Top 5 actions; Where visitors came from; Health (uptime, response time, errors,
  page load LCP with verdict, last deploy).
- **Traffic:** Pages table (views, visitors, share, exits) sortable; sources list with "Unknown" explained; the
  "Why so much is Unknown" help box only when unknown share ≥ 60%; Common paths (top 3).
- **Events:** "Events you added" grouped by name with readable names (`quote_form_submitted` → "Quote form sent"),
  count and share bar, labels in an expandable row; "Live feed" (latest 30 page views + events, newest first, with
  time, label, path, source on entry); "Tracked automatically" section showing the A2 events (empty state "Starts
  after the update" until data exists).
- **Performance:** 4 metric cards in plain words ("Page shows up", "Reacts to clicks", "Stays still while loading",
  "Server answers") with value, verdict tag, a good/needs work/poor scale with a marker, and the technical name small;
  "75th percentile" explained once; slowest pages table; daily trend (E3).
- **Uptime / API calls:** today's sections moved into tabs, using the range where data allows (checks are kept 30 days;
  for 12m say so instead of showing empty bars).

**C4. Readable names.** Event name → words: split on `_`, sentence case, known verbs mapped (`submitted` → "sent",
`opened` → "opened", `clicked` → "clicked"). Raw name stays visible in mono, small.

**C5. Story slider (all screens).** One story at a time, lean:
- Layout: one row, ~90 px tall. A blinking dot, coloured tag (PROBLEM / CHECK THIS / THIS WEEK / GOOD NEWS / FYI),
  position "3/7", and a small borderless pause/play icon on one line; an 18 px headline; one line of text ending in a
  link ("See why →"). Under it a 3 px progress bar and the dots (one per story, the active one wider, in its tone).
  **No graphic panel, no boxed prev/next buttons, no header bar.**
- Each story shows 6.5 s (+1.5 s if the line is long), then slides in from the right (0.5 s).
- Pauses while: mouse over it, keyboard focus inside it, tab hidden (`visibilitychange`), or paused by the user.
- Clicking a dot shows that story and restarts its progress. Swipe left/right on touch.
- `prefers-reduced-motion`: no autoplay and no slide animation; dots only.
- Screen readers: no announcements during autoplay; announce politely when the user changes the story.
- 0 stories → one green "All good" line, no autoplay, no dots. 1 story → no autoplay, no dots.
- Stories refresh with the page data (server render); if the page is left open, re-fetch every 5 min and apply the new
  list only when the current story finishes.
- Each link goes to the tab, range and section (anchor) that proves the story.

## 7. D. Stories engine

A pure, unit-tested module (e.g. `src/lib/stories.ts`) that takes the range's aggregates for current and previous
period and returns ranked stories `{ id, tone, title, line, link, href, project? }`. The UI never computes stories.

**D1. Rules** (per project; Home merges all projects):

| Tone | Rule | Fires when |
| --- | --- | --- |
| red | Site down | Down now, or > 2 failed checks in the range |
| red | Errors spiked | Errors ≥ 5 and ≥ 2× the previous period |
| red | Vitals poor | A metric's p75 is in Google's poor band with ≥ 20 samples (E1) |
| red | Vitals regressed after deploy | E4 |
| amber | Vitals early hint | Poor or needs-work with 5–19 samples (never red) |
| amber | Tracking broke | Page views in the last 48 h but 0 events, while events existed before that |
| amber | No events set up | ≥ 20 page views and never any event |
| amber | Traffic fell | ≥ 50% fewer views, previous period ≥ 20 views |
| amber | Source unknown | ≥ 60% of views unknown, ≥ 10 views |
| amber | API slow or failing | p95 > 2 s, or ≥ 5% failed calls |
| blue | Range summary | Always one: visitors, page views, busiest project/page |
| blue | Traffic rose | ≥ 50% more views, previous period ≥ 20 views |
| green | Cross-site visitor | A project's tagged link/outbound click to another watched project, or that project's source = another project id |
| green | Vitals recovered | A metric moved from poor to good |
| green | Funnel finished | A common path ends on a page visited by ≥ 3 visitors that no visitor left from before (generic "most visits end here") — keep it generic, ask if unsure |
| green | New record | Busiest bucket ever recorded |
| gray | No visitors | Up, 0 page views in the range |

Thresholds are constants in one place, unit tested.

**D2. Merge.** The same rule across several projects becomes one story ("3 busy sites send no clicks: Devxonic,
Radianzest, RegRead").

**D3. Ranking.** Tone (red → amber → blue → green → gray), then impact (visitors affected), then recency. Max 7 stories.
The tally line "2 problems · 2 to check · 3 updates" counts red, amber and the rest.

**D4. Wording rules.** Small numbers stay absolute ("from 4 to 1", never "−75%") below a base of 20. A previous period
of 0 says "New: 12 views". A project with no data ever says "Waiting for the first visit". A range longer than the data
says "Data starts 21 Nov". Numbers are rounded for people (4.0 s, 212 ms, 0.19).

**D5. Failure.** If a query fails, the slider shows "Couldn't load stories" with a retry link. No story is invented
from missing data.

## 8. E. Web vitals watching

**E1. Bands (Google):** LCP good ≤ 2.5 s, poor > 4 s · INP ≤ 200 ms / > 500 ms · CLS ≤ 0.1 / > 0.25 · FCP ≤ 1.8 s /
> 3 s · TTFB ≤ 0.8 s / > 1.8 s. Sample rule: ≥ 20 loads → verdict; 5–19 → "early hint, few samples" (amber at most);
< 5 → no verdict, show the value greyed with "too few loads".

**E2. Per page and device.** Slowest pages first; filter or split mobile vs desktop (A4).

**E3. Daily trend.** Performance tab chart: daily p75 per metric for the range (30d default for this chart), with deploy
markers.

**E4. Regression after deploy.** Using deploy times from `src/server/deploys.ts`: compare p75 for the 7 days before vs
after a deploy; ≥ 20% worse **and** crossed into a worse band, with ≥ 20 samples on both sides → red story "LCP got
worse after deploy 128b8e9 on 18 Nov".

**E5. Lab check (optional, Q3).** A daily Google PageSpeed Insights run per project (free API) so low-traffic sites get
a speed reading too. Shown as "lab test", never mixed into the real-visitor p75.

## 9. F. Guide and empty states

**F1. `/guide` ("How to read Pulse")**, linked in the top nav and from a "New here? Take the 2-minute tour" pill on
Home: the 4-step tour, the five words (Visitor, Page view, Event, Source, Path), the FAQ "Why don't my numbers match?"
(18 views vs 6 events; Brokwise 17 vs 1 click; Unknown sources; 12 months short; mobile long-press), "Don't count me"
links per project (A7), "Add a new project" in 2 steps.

**F2. Empty states** say why and what to do: no visitors (script missing?), no events (how to add one), no vitals yet,
no API calls reported (how to report).

**F3. README** updated: new beacon features, `?ref=`, `?pulse=ignore`, new env var.

## 10. Follow-up outside this repo

Portfolio (`AbdulSubhan1/abdulsubhan1.github.io`): change project links from `rel="noreferrer"` to `rel="noopener"`
and add `?ref=portfolio` to links to the other projects. Not part of this build; mention it in the PR.

## 11. Non-functional

- `npm run check` (typecheck, lint, vitest) passes. New unit tests: stories rules and edge cases (D1–D5), visitor hash,
  source parsing, bot filter, range buckets and previous period, readable names, vitals bands and sample rule.
- Pages stay server-rendered; the only client JS is the slider (and the beacon).
- Mobile: works at 375 px, 16 px gutters, no horizontal page scroll, touch targets ≥ 44 px.
- Accessibility: real links/buttons, `aria-current` on the active tab and range, contrast ≥ 4.5:1 on small grey text.
- Query cost: grouped queries per page (no N+1 per project), as today.

## 12. Open questions (defaults to use only if Abdul confirms)

| # | Question | Proposed default |
| --- | --- | --- |
| Q1 | Dashboard timezone for days | Asia/Karachi |
| Q2 | Alerts outside the dashboard for red stories | None in this build |
| Q3 | Daily PageSpeed lab check (E5) | Not in this build, later |
| Q4 | "Got it" dismiss on a story (per browser, returns if it gets worse) | Not in this build |
| Q5 | Rollup table vs longer raw retention for 12 months | Rollup table (B4) |

## 12a. Decisions (agreed 21 Nov, during plan review)

Q5: rollups, plus a `total` kind per project per day (visitors can't be summed across pages). 12m = rollups for
completed days + raw rows for today. Q1: one constant `DASHBOARD_TZ` in `src/lib/time.ts` (Asia/Karachi until Abdul
says otherwise), used for buckets, rollup days, the visitor hash day and the daily caps. Q2–Q4: pending, nothing built.

1. **Events** = tagged / `track()` events only. Automatic events (A2) appear only under "Tracked automatically" and
   never count in stat cards, cards or event rules.
2. Generic per-tab info stories (blue/green): top page share, top path, top action, best/worst metric with ≥ 20
   samples. Overview shows all of the project's stories (max 7, ranked by D3).
3. **Funnel finished**: the top common path has ≥ 3 steps, ≥ 3 distinct visitors followed it, and its last page is the
   most common exit page. Title "N visitors went all the way to /x".
4. **New record**: busiest day across rollups + raw, only with ≥ 20 views, ≥ 14 days of data for the project, and the
   record inside the range. For 24h: busiest hour against raw data (60 days).
5. **Vitals recovered**: poor in the previous period → good now, ≥ 20 samples on both sides.
6. **Cross-site visitor**: a referrer host or `source` matching another watched project counts.
7. **Vitals trend** follows the page range (24h hourly, 7d/30d daily, 12m = last 30 days with a "speed data is kept
   30 days" note).
8. On **12m**, paths, live feed, visits and avg time use the last 60 days of raw data and say so in the subtitle.
9. **Visitors before the update**: if the range starts before the first visitor value, show the count with "counted
   since <date>"; with none at all show "—" with "starts after the update".
10. **Avg time on site**: per visit, sum `time_on_page`; average over visits that have one.
11. The 40 automatic events per page load include `time_on_page`, which is always kept.
12. **Device split**: `?device=all|mobile|desktop` links on the Performance tab only.
13. **Uptime bars**: 24h one per check, 7d per hour, 30d per day, 12m shows the 30-day view with "checks are kept 30
    days".
14. **Slider refresh**: `router.refresh()` every 5 minutes, no new API; the new list applies when the current story
    ends. Retry = reload the same URL.
15. Pages table sorts with server-side `?sort=` links.
16. Guide follows this doc (per-project `?pulse=ignore` links, tour written around the slider), not the canvas.
17. Readable names also map `open` → "opened".
18. **Site down**: red only if down now or failures in the last 24 h; older failures in the range are amber "N failed
    checks".
19. **Deploy history**: up to 20 deploys from Vercel and from GitHub Pages (Portfolio), same cache. No token = no E4
    story, no error.

## 13. Suggested order

1. B1 migration + A6 visitors + A3 source + A5 bots (fixes the numbers first).
2. A1/A2/A4/A7 beacon features.
3. B3 range queries + B5 timezone + C1 range selector.
4. D stories engine with tests.
5. C2 home, C3 tabs, C5 slider.
6. E vitals, B4 rollups.
7. F guide, empty states, README.

Each step keeps `npm run check` green and can be its own commit.

## How to work on this

- Read this file and the design canvas first.
- Do not fill gaps with your own assumptions. When something is unclear, contradicts the design, or needs one of the
  open questions, **ask the session that started you** and wait for the answer before building that part. Keep
  working on parts that are clear meanwhile.
- Before writing code, send that session a short plan (steps, files, schema changes) and wait for agreement.
- Commit on this branch; do not push or open a PR without Abdul's OK.
