// Visits are computed, never stored: page views with the same daily visitor and project, with gaps under 30 minutes.
// Pure, so the rules are unit tested on their own.

export const VISIT_GAP_MS = 30 * 60_000;
export const PATH_MAX_STEPS = 6;
export const TOP_PATHS = 3;

export type VisitRow = {
  visitor: string;
  at: Date;
  kind: "page" | "section" | "time";
  // path for pages, section name for sections
  key: string;
  // ms for time rows
  value?: number | null;
};

export type Visit = {
  visitor: string;
  start: Date;
  end: Date;
  pages: string[];
  sections: string[];
  timeMs: number;
  hasTime: boolean;
};

export function buildVisits(rows: VisitRow[]): Visit[] {
  const sorted = [...rows].sort((a, b) => (a.visitor === b.visitor ? a.at.getTime() - b.at.getTime() : a.visitor < b.visitor ? -1 : 1));
  const visits: Visit[] = [];
  let current: Visit | null = null;
  for (const row of sorted) {
    const continues = current && current.visitor === row.visitor && row.at.getTime() - current.end.getTime() < VISIT_GAP_MS;
    if (!continues) {
      // Only a page view starts a visit; sections and time belong to the page they were seen on
      if (row.kind !== "page") continue;
      current = { visitor: row.visitor, start: row.at, end: row.at, pages: [], sections: [], timeMs: 0, hasTime: false };
      visits.push(current);
    }
    const v = current!;
    v.end = row.at;
    if (row.kind === "page") v.pages.push(row.key);
    else if (row.kind === "section") v.sections.push(row.key);
    else {
      v.timeMs += row.value ?? 0;
      v.hasTime = true;
    }
  }
  return visits;
}

// Consecutive repeats collapse ("/a, /a, /b" is "/a → /b"), and a path has at most 6 steps
export function stepsOf(list: string[]): string[] {
  const steps: string[] = [];
  for (const s of list) if (steps[steps.length - 1] !== s) steps.push(s);
  return steps.slice(0, PATH_MAX_STEPS);
}

export type CommonPath = { steps: string[]; visits: number; visitors: number };

// The most frequent ordered page sequences of visits with at least 2 steps. On a one-page site (every visit on the
// same single page) the order of sections seen is used instead.
export function commonPaths(visits: Visit[], limit = TOP_PATHS): { bySections: boolean; paths: CommonPath[] } {
  const distinctPages = new Set(visits.flatMap((v) => v.pages));
  const bySections = distinctPages.size === 1;
  const counts = new Map<string, { steps: string[]; visits: number; visitors: Set<string> }>();
  for (const v of visits) {
    const steps = stepsOf(bySections ? v.sections : v.pages);
    if (steps.length < 2) continue;
    const key = steps.join("\u0000");
    const c = counts.get(key) ?? { steps, visits: 0, visitors: new Set<string>() };
    c.visits++;
    c.visitors.add(v.visitor);
    counts.set(key, c);
  }
  const paths = [...counts.values()]
    .map((c) => ({ steps: c.steps, visits: c.visits, visitors: c.visitors.size }))
    .sort((a, b) => b.visits - a.visits || b.visitors - a.visitors || b.steps.length - a.steps.length)
    .slice(0, limit);
  return { bySections, paths };
}

// How many visits started and ended on each page
export function entriesAndExits(visits: Visit[]): { entries: Map<string, number>; exits: Map<string, number> } {
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  for (const v of visits) {
    if (!v.pages.length) continue;
    const first = v.pages[0];
    const last = v.pages[v.pages.length - 1];
    entries.set(first, (entries.get(first) ?? 0) + 1);
    exits.set(last, (exits.get(last) ?? 0) + 1);
  }
  return { entries, exits };
}

export function topKey(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let max = 0;
  for (const [k, n] of counts) {
    if (n > max) {
      best = k;
      max = n;
    }
  }
  return best;
}

// Visitors with a visit in the range who also had an earlier visit in the rows given (inside the range or before it)
export function returningVisitors(visits: Visit[], rangeStart: Date): number {
  const byVisitor = new Map<string, { inRange: boolean; count: number }>();
  for (const v of visits) {
    const e = byVisitor.get(v.visitor) ?? { inRange: false, count: 0 };
    e.count++;
    if (v.start >= rangeStart) e.inRange = true;
    byVisitor.set(v.visitor, e);
  }
  let n = 0;
  for (const e of byVisitor.values()) if (e.inRange && e.count >= 2) n++;
  return n;
}

// Average visit length: the visible time of every page in a visit added up, over visits that reported any time
export function averageVisitMs(visits: Visit[]): number | null {
  const timed = visits.filter((v) => v.hasTime);
  if (!timed.length) return null;
  return timed.reduce((sum, v) => sum + v.timeMs, 0) / timed.length;
}
