# Case study: Pulse, a monitor I built for my own projects

**Live:** https://abdulsubhan-pulse.vercel.app · **Code:** https://github.com/AbdulSubhan1/monitor

## The problem

I run five live projects: my portfolio on GitHub Pages and four Next.js apps on Vercel (a CRM, a payment gateway, a
broker website and an AI job tool). I had no single place to see whether they were up, whether anyone visited, and
whether anything was failing. The usual answer is three vendors: an uptime robot, a tag manager or pixel, and a log
service like Axiom. For five small sites that is three scripts, three accounts and cookies I don't need.

## What I built

One small Next.js app that does the three jobs on free tiers:

1. **Uptime:** a GitHub Actions schedule calls a protected route every 10 minutes; each site is checked in parallel
   and the result is stored.
2. **A cookie-free beacon:** one script tag per site sends page views, every CTA click as a named, labelled event
   (`plan_selected` · `Bluepeak Plus`), browser errors and Core Web Vitals of real visitors.
3. **An error, log and API-call endpoint:** each app's server sends errors and every API call it makes (route, status,
   time) with its own token; Next.js apps send every server error automatically from `onRequestError`.
4. **One dashboard:** status, uptime, traffic for 24 h and 7 days, errors and last deploy per project, plus a logs
   page with filters.

## Decisions I'd defend in a review

- **Build the ingest instead of renting it.** The interesting parts of analytics and logging are the boring ones:
  who may write, what shape is accepted, what is never stored, and when data is deleted. Pulse does each explicitly.
- **Privacy by design.** No cookies, ids or IPs. Paths lose their query string and hash (they carry tokens and emails),
  referrers keep only the host. That is why there is no "unique visitors" number, and I'm fine with that.
- **Writes are locked down without a login.** The beacon only accepts its project's own sites (Origin check), strict
  shapes and small bodies. Server logs need a per-project token that is an HMAC of the project id with one secret, so
  Pulse stores no tokens and a leaked token can't write as another project.
- **The monitor can never break the apps.** `sendBeacon` with `text/plain` needs no CORS preflight and doesn't block
  rendering; server reporting has a 2-second timeout and ignores failures; browsers send at most 5 errors per page.
- **Performance without a library.** Core Web Vitals come from the browser's own `PerformanceObserver`, with CLS
  session windows as Google defines them, reported as p75 like Search Console.
- **API logs that group and don't leak.** Ids in API paths become `:id` on the server, so calls group by route and no
  customer id is stored; failures (no answer or 5xx) are counted apart from 4xx.
- **Honest charts.** If the scheduler misses a slot, the uptime strip shows grey, not green.
- **Fit the free tier.** Vercel Hobby crons run once a day, so the schedule lives in GitHub Actions; every run also
  deletes data older than 30 days so Neon's free storage never fills.
- **Small on purpose.** Projects are a typed list in code, not a table with an admin screen. No chart library: the
  charts are SVG rects. Alerts, rate limits and log search are written down with the trigger that would justify them.

## Stack

Next.js 16, TypeScript, Tailwind 4, Drizzle on Neon Postgres, PGlite for local dev, Zod, Vitest, GitHub Actions.

## Where it stands

Live on Vercel, checking all five projects every 10 minutes. The portfolio and Brokwise send page views, events and
errors to it.
