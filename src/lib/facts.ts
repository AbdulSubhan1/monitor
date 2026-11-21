import type { Metric } from "@/lib/vitals";
import type { CommonPath } from "@/lib/visits";

// What the data layer knows about one project for one range (and its previous period). The stories engine and the
// pages read only this shape, so the engine stays pure and is tested with plain objects.

export type MetricFacts = { p75: number | null; samples: number; prevP75: number | null; prevSamples: number };

export type Regression = { metric: Metric; commit: string | null; at: Date; before: number; after: number };

export type ProjectFacts = {
  id: string;
  name: string;
  // Local day of the first data ever kept for this project (page view or event), null when there is none
  dataStart: string | null;
  // Local day of the first page view with a visitor id (visitors are counted since then)
  visitorsSince: string | null;
  status: {
    downNow: boolean | null;
    checks: number;
    failed: number;
    failed24h: number;
    uptime: number | null;
    avgMs: number | null;
  };
  views: number;
  prevViews: number;
  visitors: number;
  prevVisitors: number;
  // Tagged events only (data-pulse-event and pulse.track); automatic events are never counted here
  events: number;
  prevEvents: number;
  buckets: { key: string; label: string; views: number; visitors: number }[];
  // Page views per source: the ?ref= tag, else the referring host; "" is unknown
  sources: { key: string; views: number; visitors: number }[];
  unknownViews: number;
  views48h: number;
  events48h: number;
  eventsBefore48h: number;
  eventsEver: number;
  errors: number;
  prevErrors: number;
  vitals: Record<Metric, MetricFacts>;
  regressions: Regression[];
  api: { calls: number; failed: number; p95: number | null } | null;
  // Other watched projects that sent page views here (by ?ref= or referrer), and clicks from here to them
  referrals: { from: string; name: string; views: number }[];
  outbound: { to: string; name: string; clicks: number }[];
  topPage: { path: string; views: number } | null;
  pageCount: number;
  topAction: { name: string; label: string | null; count: number } | null;
  topPath: (CommonPath & { bySections: boolean; endsAtTopExit: boolean }) | null;
  // The busiest bucket ever recorded, when it falls inside this range
  record: { key: string; label: string; views: number } | null;
};
