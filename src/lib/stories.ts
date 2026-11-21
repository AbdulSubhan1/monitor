import type { MetricFacts, ProjectFacts } from "@/lib/facts";
import { formatCount } from "@/lib/format";
import { readableName } from "@/lib/names";
import { RANGE_PHRASE, dayLabel, type Range, type RangeKey } from "@/lib/range";
import { localDay } from "@/lib/time";
import { formatMetric, METRICS, rate, type Metric } from "@/lib/vitals";

// The stories engine: turns a range's facts (current and previous period) into short, ranked stories. Pure and
// generic: no rule knows a project by name. The UI never computes stories, it only shows them.

export type Tone = "red" | "amber" | "blue" | "green" | "gray";
export type Tab = "overview" | "traffic" | "events" | "performance" | "uptime" | "api";

export type Story = {
  id: string;
  tone: Tone;
  title: string;
  line: string;
  link: string;
  href: string;
  // Projects the story is about (one, or several when merged)
  projects: string[];
  tab: Tab;
  impact: number;
  at: number;
};

// Every threshold in one place
export const T = {
  checksFailed: 2,
  errorsMin: 5,
  errorsFactor: 2,
  vitalsVerdict: 20,
  vitalsHint: 5,
  noEventsViews: 20,
  trafficBase: 20,
  trafficFell: 0.5,
  trafficRose: 1.5,
  unknownShare: 0.6,
  unknownMinViews: 10,
  apiP95Ms: 2000,
  apiFailedShare: 0.05,
  apiMinCalls: 20,
  funnelSteps: 3,
  funnelVisitors: 3,
  smallBase: 20,
  topPageMinViews: 10,
  topPathMinVisits: 2,
  topActionMin: 3,
  returningMin: 5,
  maxStories: 7,
} as const;

const TONE_ORDER: Tone[] = ["red", "amber", "blue", "green", "gray"];

export const TONE_TAG: Record<Exclude<Tone, "blue">, string> = {
  red: "PROBLEM",
  amber: "CHECK THIS",
  green: "GOOD NEWS",
  gray: "FYI",
};

// The blue tag names the range, so it is never "this week" on a 30-day page
export const BLUE_TAG: Record<RangeKey, string> = {
  "24h": "LAST 24 HOURS",
  "7d": "LAST 7 DAYS",
  "30d": "LAST 30 DAYS",
  "12m": "LAST 12 MONTHS",
};

export function tagOf(tone: Tone, range: RangeKey): string {
  return tone === "blue" ? BLUE_TAG[range] : TONE_TAG[tone];
}

// Metrics the dashboard shows as cards, in plain words
export const STORY_METRICS: Metric[] = ["lcp", "inp", "cls", "ttfb"];
export const PLAIN_METRIC: Record<Metric, string> = {
  lcp: "Page shows up",
  inp: "Reacts to clicks",
  cls: "Stays still while loading",
  fcp: "First thing on screen",
  ttfb: "Server answers",
};

export type StoryScope = { kind: "home" } | { kind: "project"; id: string };

export type StoryContext = { range: Range; scope: StoryScope; now?: Date };

// --- Words -------------------------------------------------------------------------------------------------------

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

// Small numbers stay absolute ("from 4 to 1"); a previous period of 0 is "New"; only a base of 20+ gets a percentage
export function change(prev: number, cur: number, unit: string): string {
  if (prev === 0) return `New: ${plural(cur, unit)}`;
  if (prev < T.smallBase) return `from ${formatCount(prev)} to ${formatCount(cur)}`;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%, from ${formatCount(prev)} to ${formatCount(cur)}`;
}

export function names(list: string[]): string {
  if (list.length <= 1) return list.join("");
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function limitText(metric: Metric): string {
  return `Good is under ${formatMetric(metric, METRICS[metric].good)}`;
}

// --- Links -------------------------------------------------------------------------------------------------------

export function projectHref(id: string, tab: Tab, range: Range, anchor?: string): string {
  const q = new URLSearchParams();
  if (tab !== "overview") q.set("tab", tab);
  if (range.key !== "7d") q.set("range", range.key);
  const s = q.toString();
  return `/projects/${id}${s ? `?${s}` : ""}${anchor ? `#${anchor}` : ""}`;
}

// --- Rules -------------------------------------------------------------------------------------------------------

type Draft = Omit<Story, "id" | "projects" | "at"> & { rule: string; key?: string; at?: number };
type Rule = (f: ProjectFacts, ctx: StoryContext) => Draft[];

const people = (f: ProjectFacts) => Math.max(f.visitors, f.views ? 1 : 0);

const siteDown: Rule = (f, { range }) => {
  const s = f.status;
  if (s.downNow) {
    return [{ rule: "down", tone: "red", title: `${f.name} is down`, line: "The last uptime check got no good answer. Visitors can't open it right now.", link: "See the checks", href: projectHref(f.id, "uptime", range, "checks"), tab: "uptime", impact: 1e9 }];
  }
  if (s.failed > T.checksFailed) {
    const recent = s.failed24h > 0;
    return [
      {
        rule: recent ? "failing" : "failed-before",
        tone: recent ? "red" : "amber",
        title: recent ? `${f.name} failed ${plural(s.failed24h, "check")} in the last 24 hours` : `${f.name} had ${plural(s.failed, "failed check")}`,
        line: recent ? "It is up again now, but it went down more than once today." : `All before the last 24 hours, ${RANGE_PHRASE[range.key]}. It is up now.`,
        link: "See the checks",
        href: projectHref(f.id, "uptime", range, "checks"),
        tab: "uptime",
        impact: s.failed,
      },
    ];
  }
  return [];
};

const errorsSpiked: Rule = (f) => {
  if (f.errors < T.errorsMin || f.errors < T.errorsFactor * f.prevErrors) return [];
  return [
    {
      rule: "errors",
      tone: "red",
      title: `${f.name} has ${plural(f.errors, "error")}`,
      line: `${change(f.prevErrors, f.errors, "error")} compared with the period before.`,
      link: "See the errors",
      href: `/logs?project=${f.id}&level=error`,
      tab: "overview",
      impact: f.errors,
    },
  ];
};

function metricTitle(name: string, m: Metric, value: number | null): string {
  const v = formatMetric(m, value);
  switch (m) {
    case "lcp":
      return `${name} takes ${v} to show up`;
    case "inp":
      return `${name} takes ${v} to react to clicks`;
    case "cls":
      return `${name} jumps while loading (${v})`;
    case "ttfb":
      return `${name}'s server takes ${v} to answer`;
    default:
      return `${name} takes ${v} to show anything`;
  }
}

const vitalsRules: Rule = (f, { range }) => {
  const out: Draft[] = [];
  for (const m of STORY_METRICS) {
    const v: MetricFacts = f.vitals[m];
    const r = rate(m, v.p75);
    const href = projectHref(f.id, "performance", range, "metrics");
    if (r === "poor" && v.samples >= T.vitalsVerdict) {
      out.push({ rule: `vitals-poor-${m}`, key: m, tone: "red", title: metricTitle(f.name, m, v.p75), line: `For 1 in 4 visits, from ${plural(v.samples, "page load")}. ${limitText(m)}.`, link: "See the slow pages", href, tab: "performance", impact: v.samples });
    } else if ((r === "poor" || r === "needs-work") && v.samples >= T.vitalsHint && v.samples < T.vitalsVerdict) {
      out.push({ rule: `vitals-hint-${m}`, key: m, tone: "amber", title: `${f.name} may be slow: ${PLAIN_METRIC[m].toLowerCase()} ${formatMetric(m, v.p75)}`, line: `Only ${plural(v.samples, "load")} measured, so this is an early hint. ${limitText(m)}.`, link: "See the measures", href, tab: "performance", impact: v.samples });
    }
    if (rate(m, v.prevP75) === "poor" && v.prevSamples >= T.vitalsVerdict && r === "good" && v.samples >= T.vitalsVerdict) {
      out.push({ rule: `vitals-recovered-${m}`, key: m, tone: "green", title: `${f.name}: ${PLAIN_METRIC[m].toLowerCase()} is good again`, line: `${formatMetric(m, v.prevP75)} before, ${formatMetric(m, v.p75)} now, from ${plural(v.samples, "page load")}.`, link: "See the measures", href, tab: "performance", impact: v.samples });
    }
  }
  for (const g of f.regressions) {
    out.push({
      rule: `vitals-regressed-${g.metric}`,
      key: `${g.metric}-${g.commit ?? g.at.getTime()}`,
      tone: "red",
      title: `${METRICS[g.metric].name} got worse after ${g.commit ? `deploy ${g.commit}` : "a deploy"} on ${dayLabel(localDay(g.at, range.tz))}`,
      line: `${f.name}: ${PLAIN_METRIC[g.metric].toLowerCase()} went from ${formatMetric(g.metric, g.before)} to ${formatMetric(g.metric, g.after)} in the week after.`,
      link: "See the trend",
      href: projectHref(f.id, "performance", range, "trend"),
      tab: "performance",
      impact: 1e6,
      at: g.at.getTime(),
    });
  }
  return out;
};

const eventRules: Rule = (f, { range }) => {
  const out: Draft[] = [];
  if (f.views48h > 0 && f.events48h === 0 && f.eventsBefore48h > 0) {
    out.push({ rule: "tracking-broke", tone: "amber", title: `${f.name} sends no events since 2 days`, line: `${plural(f.views48h, "page view")} in the last 48 hours but no clicks or forms, while events came in before. A deploy may have removed the tags.`, link: "See the live feed", href: projectHref(f.id, "events", range, "feed"), tab: "events", impact: people(f) });
  }
  if (f.views >= T.noEventsViews && f.eventsEver === 0) {
    out.push({ rule: "no-events", tone: "amber", title: `${f.name} sends no clicks`, line: "Pulse sees people arrive but not what they do there. One attribute per button fixes it.", link: "How to add events", href: "/guide#events", tab: "events", impact: people(f) });
  }
  return out;
};

const trafficRules: Rule = (f, { range }) => {
  const out: Draft[] = [];
  const href = projectHref(f.id, "overview", range, "chart");
  if (f.prevViews >= T.trafficBase && f.views <= f.prevViews * T.trafficFell) {
    out.push({ rule: "traffic-fell", tone: "amber", title: `${f.name}: fewer page views`, line: `${change(f.prevViews, f.views, "page view")}, compared with the period before.`, link: "See it per day", href, tab: "overview", impact: f.prevViews - f.views });
  }
  if (f.prevViews >= T.trafficBase && f.views >= f.prevViews * T.trafficRose) {
    out.push({ rule: "traffic-rose", tone: "blue", title: `${f.name}: more page views`, line: `${change(f.prevViews, f.views, "page view")}, compared with the period before.`, link: "See it per day", href, tab: "overview", impact: f.views - f.prevViews });
  }
  if (f.views >= T.unknownMinViews && f.unknownViews / f.views >= T.unknownShare) {
    out.push({ rule: "unknown-source", tone: "amber", title: `${formatCount(f.unknownViews)} of ${formatCount(f.views)} views on ${f.name} have no known source`, line: "People came from a link that hides itself, or typed the address. Add ?ref= to the links you share.", link: "Why and how to fix", href: projectHref(f.id, "traffic", range, "fix"), tab: "traffic", impact: f.unknownViews });
  }
  return out;
};

const apiRule: Rule = (f, { range }) => {
  const a = f.api;
  if (!a || a.calls < T.apiMinCalls) return [];
  const failing = a.failed / a.calls >= T.apiFailedShare;
  const slow = a.p95 !== null && a.p95 > T.apiP95Ms;
  if (!failing && !slow) return [];
  return [
    {
      rule: "api",
      tone: "amber",
      title: failing ? `${f.name}: ${formatCount(a.failed)} of ${formatCount(a.calls)} API calls failed` : `${f.name}'s API is slow`,
      line: slow ? `The slowest 1 in 20 calls take ${(a.p95! / 1000).toFixed(1)} s or more.` : "Failed means no answer or a 5xx error from the API.",
      link: "See the routes",
      href: projectHref(f.id, "api", range, "routes"),
      tab: "api",
      impact: a.failed || a.calls,
    },
  ];
};

const goodNews: Rule = (f, { range }) => {
  const out: Draft[] = [];
  for (const r of f.referrals) {
    out.push({ rule: `cross-in-${r.from}`, key: r.from, tone: "green", title: `${r.name} sent ${plural(r.views, "page view")} to ${f.name}`, line: `From ${r.name}, through a link or a ?ref= tag.`, link: "See the sources", href: projectHref(f.id, "traffic", range, "sources"), tab: "traffic", impact: r.views });
  }
  for (const o of f.outbound) {
    out.push({ rule: `cross-out-${o.to}`, key: o.to, tone: "green", title: `${f.name} sent ${plural(o.clicks, "click")} to ${o.name}`, line: "People followed a link from this site to another of your projects.", link: "See the events", href: projectHref(f.id, "events", range, "list"), tab: "events", impact: o.clicks });
  }
  const p = f.topPath;
  if (p && !p.bySections && p.steps.length >= T.funnelSteps && p.visitors >= T.funnelVisitors && p.endsAtTopExit) {
    out.push({ rule: "funnel", tone: "green", title: `${formatCount(p.visitors)} visitors on ${f.name} went all the way to ${p.steps[p.steps.length - 1]}`, line: `${p.steps.join(" → ")}. Most visits end there.`, link: "See the paths", href: projectHref(f.id, "traffic", range, "paths"), tab: "traffic", impact: p.visitors });
  }
  if (f.record) {
    out.push({ rule: "record", tone: "green", title: `${f.name}'s busiest ${range.unit === "hour" ? "hour" : "day"} yet: ${plural(f.record.views, "page view")}`, line: `On ${f.record.label}, more than any ${range.unit === "hour" ? "hour" : "day"} Pulse has recorded.`, link: "See it per day", href: projectHref(f.id, "overview", range, "chart"), tab: "overview", impact: f.record.views });
  }
  return out;
};

const quiet: Rule = (f, { range }) => {
  if (f.status.downNow || f.views > 0) return [];
  if (!f.dataStart) {
    return [{ rule: "waiting", tone: "gray", title: `${f.name} is waiting for the first visit`, line: "It is up and checked every 10 minutes. No page view has arrived yet; is the Pulse script on the site?", link: "How to check the script", href: "/guide#script", tab: "overview", impact: 0 }];
  }
  return [{ rule: "no-visitors", tone: "gray", title: `${f.name} had no visitors ${RANGE_PHRASE[range.key]}`, line: "It is up and checked every 10 minutes. Nobody opened it, or the Pulse script is missing.", link: "How to check the script", href: "/guide#script", tab: "overview", impact: 0 }];
};

// Generic per-tab facts for a project page: what stands out, said in a line
const tabInfo: Rule = (f, { range }) => {
  const out: Draft[] = [];
  if (f.topPage && f.views >= T.topPageMinViews && f.pageCount > 1) {
    const share = Math.round((f.topPage.views / f.views) * 100);
    out.push({ rule: "top-page", tone: "blue", title: `${f.topPage.path} gets ${share}% of page views`, line: `${plural(f.topPage.views, "view")} of ${formatCount(f.views)}, the most of ${plural(f.pageCount, "page")}.`, link: "See the pages", href: projectHref(f.id, "traffic", range, "pages"), tab: "traffic", impact: f.topPage.views });
  }
  const p = f.topPath;
  if (p && p.visits >= T.topPathMinVisits) {
    out.push({ rule: "top-path", tone: "blue", title: `Most ${p.bySections ? "visits scroll through" : "people follow"} the same ${p.steps.length} steps`, line: `${p.steps.join(" → ")}, in ${plural(p.visits, "visit")}. Pulse found this by itself.`, link: "See the paths", href: projectHref(f.id, "traffic", range, "paths"), tab: "traffic", impact: p.visits });
  }
  if (f.topAction && f.topAction.count >= T.topActionMin) {
    const a = f.topAction;
    out.push({ rule: "top-action", tone: "blue", title: `Top action: ${readableName(a.name).toLowerCase()}`, line: `${plural(a.count, "time")}${a.label ? `, most often “${a.label}”` : ""}.`, link: "See the events", href: projectHref(f.id, "events", range, "list"), tab: "events", impact: a.count });
  }
  const measured = STORY_METRICS.filter((m) => f.vitals[m].samples >= T.vitalsVerdict && f.vitals[m].p75 !== null);
  const good = measured.filter((m) => rate(m, f.vitals[m].p75) === "good");
  if (good.length) {
    // The best one: furthest under its good limit
    const best = good.sort((a, b) => f.vitals[a].p75! / METRICS[a].good - f.vitals[b].p75! / METRICS[b].good)[0];
    out.push({ rule: "best-metric", tone: "green", title: `${PLAIN_METRIC[best]}: good, ${formatMetric(best, f.vitals[best].p75)}`, line: `For 3 in 4 visits, from ${plural(f.vitals[best].samples, "page load")}. ${limitText(best)}.`, link: "See the measures", href: projectHref(f.id, "performance", range, "metrics"), tab: "performance", impact: f.vitals[best].samples });
  }
  const work = measured.filter((m) => rate(m, f.vitals[m].p75) === "needs-work");
  if (work.length) {
    const worst = work.sort((a, b) => f.vitals[b].p75! / METRICS[b].good - f.vitals[a].p75! / METRICS[a].good)[0];
    out.push({ rule: "worst-metric", tone: "blue", title: `${PLAIN_METRIC[worst]} needs work: ${formatMetric(worst, f.vitals[worst].p75)}`, line: `Not poor, but over the good limit. ${limitText(worst)}.`, link: "See the measures", href: projectHref(f.id, "performance", range, "metrics"), tab: "performance", impact: f.vitals[worst].samples });
  }
  return out;
};

const PROJECT_RULES: Rule[] = [siteDown, errorsSpiked, vitalsRules, eventRules, trafficRules, apiRule, goodNews, quiet];

// --- Summary (always one) ----------------------------------------------------------------------------------------

function dataStartsNote(facts: ProjectFacts[], range: Range): string {
  const starts = facts.map((f) => f.dataStart).filter((d): d is string => !!d);
  if (!starts.length) return "";
  const first = starts.sort()[0];
  return first > localDay(range.start, range.tz) ? ` Data starts ${dayLabel(first)}.` : "";
}

// "12 visitors, 4 returning." once there are enough visitors for it to mean something
function visitorsText(visitors: number, returning: number): string {
  if (!visitors) return "";
  return `${plural(visitors, "visitor")}${visitors >= T.returningMin && returning ? `, ${formatCount(returning)} returning` : ""}. `;
}

function homeSummary(facts: ProjectFacts[], range: Range): Draft {
  const views = facts.reduce((s, f) => s + f.views, 0);
  // A person who opened two of the sites counts on each
  const visitors = facts.reduce((s, f) => s + f.visitors, 0);
  const returning = facts.reduce((s, f) => s + f.returning, 0);
  const busy = facts.filter((f) => f.views > 0).sort((a, b) => b.views - a.views);
  const sites = busy.length;
  const top = busy.slice(0, 3).map((f) => f.name);
  return {
    rule: "summary",
    tone: "blue",
    title: views ? `${plural(views, "page")} opened on ${plural(sites, "site")}` : `No page views ${RANGE_PHRASE[range.key]}`,
    line: views
      ? `${visitorsText(visitors, returning)}${top.length > 1 ? `${names(top)} got the most.` : `All on ${top[0]}.`}${dataStartsNote(facts, range)}`
      : `All projects are checked every 10 minutes; no visits arrived.${dataStartsNote(facts, range)}`,
    link: busy[0] ? "Open the busiest project" : "How Pulse counts",
    href: busy[0] ? projectHref(busy[0].id, "overview", range) : "/guide",
    tab: "overview",
    impact: views,
  };
}

function projectSummary(f: ProjectFacts, range: Range): Draft {
  const who = f.visitorsSince ? `${f.visitors === 1 ? "1 person" : `About ${formatCount(f.visitors)} people`}` : "Visitors";
  return {
    rule: "summary",
    tone: "blue",
    title: f.views ? `${who} opened ${plural(f.views, "page")}` : `No page views ${RANGE_PHRASE[range.key]}`,
    line: f.views
      ? `${visitorsText(f.visitorsSince ? f.visitors : 0, f.returning)}${f.topPage ? `Busiest page: ${f.topPage.path} (${plural(f.topPage.views, "view")}).` : ""} ${plural(f.events, "event")} from tagged buttons and forms.${dataStartsNote([f], range)}`.trim()
      : `It is checked every 10 minutes; nobody opened it.${dataStartsNote([f], range)}`,
    link: "See the pages",
    href: projectHref(f.id, "traffic", range, "pages"),
    tab: "overview",
    impact: f.views,
  };
}

// --- Merge, rank, select -----------------------------------------------------------------------------------------

// Same rule on several projects becomes one story listing them
function mergeTitle(rule: string, drafts: Draft[], list: string[]): { title: string; line: string } | null {
  const n = list.length;
  const base = rule.replace(/-(lcp|inp|cls|fcp|ttfb)$/, "");
  const metric = rule.match(/-(lcp|inp|cls|fcp|ttfb)$/)?.[1] as Metric | undefined;
  switch (base) {
    case "no-events":
      return { title: `${n} busy sites send no clicks: ${names(list)}`, line: drafts[0].line };
    case "tracking-broke":
      return { title: `${n} sites stopped sending events: ${names(list)}`, line: "Page views still arrive, but no clicks or forms for 2 days. A deploy may have removed the tags." };
    case "no-visitors":
    case "waiting":
      return { title: `${n} sites had no visitors at all`, line: `${names(list)}. They are up and checked every 10 minutes. Nobody opened them, or the Pulse script is missing.` };
    case "down":
      return { title: `${names(list)} are down`, line: "The last uptime checks got no good answer." };
    case "vitals-poor":
      return { title: `${PLAIN_METRIC[metric!]} is poor on ${n} sites: ${names(list)}`, line: `For 1 in 4 visits. ${limitText(metric!)}.` };
    case "vitals-hint":
      return { title: `${n} sites may be slow: ${names(list)}`, line: `${PLAIN_METRIC[metric!]}, from few page loads so far, so this is an early hint. ${limitText(metric!)}.` };
    case "unknown-source":
      return { title: `Most views on ${n} sites have no known source`, line: `${names(list)}. Add ?ref= to the links you share and Pulse shows where people came from.` };
    case "traffic-fell":
      return { title: `Fewer page views on ${n} sites: ${names(list)}`, line: "At least half fewer than the period before." };
    case "traffic-rose":
      return { title: `More page views on ${n} sites: ${names(list)}`, line: "At least half more than the period before." };
    default:
      return null;
  }
}

function finish(drafts: (Draft & { project: string })[], merge: boolean, nameOf: (id: string) => string): Story[] {
  const groups = new Map<string, (Draft & { project: string })[]>();
  for (const d of drafts) {
    const id = merge ? d.rule : `${d.rule}:${d.project}`;
    groups.set(id, [...(groups.get(id) ?? []), d]);
  }
  const stories: Story[] = [];
  for (const [id, list] of groups) {
    const projects = [...new Set(list.map((d) => d.project))];
    const first = list[0];
    const merged = list.length > 1 ? mergeTitle(first.rule, list, projects.map(nameOf)) : null;
    if (list.length > 1 && !merged) {
      // A rule without a merged wording keeps one story per project
      for (const d of list) stories.push(toStory(`${d.rule}:${d.project}`, d, [d.project]));
      continue;
    }
    const story = toStory(id, first, projects);
    if (merged) {
      story.title = merged.title;
      story.line = merged.line;
      story.impact = list.reduce((s, d) => s + d.impact, 0);
      story.at = Math.max(...list.map((d) => d.at ?? 0));
    }
    stories.push(story);
  }
  return rank(stories);
}

function toStory(id: string, d: Draft, projects: string[]): Story {
  return { id, tone: d.tone, title: d.title, line: d.line, link: d.link, href: d.href, projects, tab: d.tab, impact: d.impact, at: d.at ?? 0 };
}

// Tone first (red, amber, blue, green, gray), then impact, then the most recent
export function rank(stories: Story[]): Story[] {
  return [...stories].sort(
    (a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone) || b.impact - a.impact || b.at - a.at || a.id.localeCompare(b.id),
  );
}

// All stories for a scope, ranked (not yet cut to 7)
export function buildStories(all: ProjectFacts[], ctx: StoryContext): Story[] {
  const nameOf = (id: string) => all.find((f) => f.id === id)?.name ?? id;
  if (ctx.scope.kind === "home") {
    const drafts = all.flatMap((f) => PROJECT_RULES.flatMap((r) => r(f, ctx)).map((d) => ({ ...d, project: f.id })));
    drafts.push({ ...homeSummary(all, ctx.range), project: "*" });
    return finish(drafts, true, nameOf).map((s) => (s.projects[0] === "*" ? { ...s, projects: [] } : s));
  }
  const scopeId = ctx.scope.id;
  const f = all.find((x) => x.id === scopeId);
  if (!f) return [];
  const drafts = [...PROJECT_RULES, tabInfo].flatMap((r) => r(f, ctx)).map((d) => ({ ...d, project: f.id }));
  drafts.push({ ...projectSummary(f, ctx.range), project: f.id });
  return finish(drafts, false, nameOf);
}

// What one slider shows: Overview (and Home) everything, other tabs their own stories; at most 7
export function storiesFor(stories: Story[], tab: Tab = "overview"): Story[] {
  const list = tab === "overview" ? stories : stories.filter((s) => s.tab === tab);
  const top = list.slice(0, T.maxStories);
  // The range summary is always one of them, even when 7 problems come first
  const summary = list.find((s) => s.id.startsWith("summary"));
  if (summary && !top.includes(summary)) top[top.length - 1] = summary;
  return rank(top);
}

// "2 problems · 2 to check · 3 updates"
export function tally(stories: Story[]): string {
  const red = stories.filter((s) => s.tone === "red").length;
  const amber = stories.filter((s) => s.tone === "amber").length;
  const rest = stories.length - red - amber;
  return [plural(red, "problem"), `${formatCount(amber)} to check`, plural(rest, "update")].join(" · ");
}
