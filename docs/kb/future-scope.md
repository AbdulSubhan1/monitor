# Future scope

Left out on purpose to keep Pulse small. Each item has the trigger that would make it worth building.

| Idea | Why not now | Build it when |
| --- | --- | --- |
| **Alerts** (email when a site is down twice in a row) | I look at the dashboard; five demo sites don't page anyone. | A project gets real users or a client. Resend's free plan from the cron route would be enough. |
| **Rate limit on `/api/collect`** | Origin checks stop browsers on other sites; a script can still fake the header. Inflated counts on a demo cost nothing. | Someone spams it. A per-IP hourly counter in Postgres (as in Brokwise) is ready to copy. |
| **Unique visitors** | Needs an id or a daily salted IP hash, which is tracking. | A project needs it for a real decision. |
| **Log search** | Filters by project and level are enough for a few logs a day. | Logs grow past a few hundred a day. Postgres full-text search on `message` first. |
| **Public status page per project** | The overview already is one. | A client wants a link without the other projects. |
