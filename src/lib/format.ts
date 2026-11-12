const number = new Intl.NumberFormat("en");

export function formatCount(n: number): string {
  return number.format(n);
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null) return "–";
  const pct = ratio * 100;
  return `${pct === 100 ? "100" : pct.toFixed(pct >= 99 ? 2 : 1)}%`;
}

export function timeAgo(date: Date, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function formatTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
