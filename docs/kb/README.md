# Pulse knowledge base

| Page | What it covers |
| --- | --- |
| [Engineering highlights](engineering-highlights.md) | Every engineering decision: architecture, security, privacy, reliability, uptime |
| [Future scope](future-scope.md) | What was left out and what would trigger building it |
| [Plan](../plan.md) | The agreed scope and steps |
| [Case study](../case-study.md) | The portfolio write-up |

## How it fits together

```
 my sites ──beacon.js──► POST /api/collect ──► events / logs (browser errors)
 my apps' servers ──Bearer token──► POST /api/logs ──► logs
 GitHub Actions (every 10 min) ──Bearer CRON_SECRET──► POST /api/cron/check ──► checks (+ 30-day cleanup)
 Vercel API + GitHub API ──(cached 10 min)──► last deploy
                     all of it ──► / (overview), /projects/[id], /logs (password)
```

## Adding a project

1. Add it to `src/lib/projects.ts` (id, URL, check path, allowed origins, where it deploys).
2. On the site: `<script defer src="https://<pulse>/beacon.js" data-project="<id>"></script>`.
3. Optional, for server errors: set `MONITOR_LOG_TOKEN` in that app
   (`npm run -s log-token -- <id> | vercel env add MONITOR_LOG_TOKEN production`) and add `onRequestError` in its
   `instrumentation.ts` (see Brokwise).
