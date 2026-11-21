import Link from "next/link";
import { RANGE_LABEL, RANGES, type RangeKey } from "@/lib/range";

// Builds a link to the same page with some search params changed; the default range and tab stay out of the URL
export function hrefWith(path: string, params: Record<string, string | undefined>, change: Record<string, string | undefined>) {
  const merged = { ...params, ...change };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "") continue;
    if (k === "range" && v === "7d") continue;
    if (k === "tab" && v === "overview") continue;
    q.set(k, v);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

// One range for the whole page, as links (server-rendered, shareable)
export function RangePicker({ current, path, params }: { current: RangeKey; path: string; params: Record<string, string | undefined> }) {
  return (
    <nav aria-label="Time range" className="flex flex-wrap gap-2">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={hrefWith(path, params, { range: r })}
          aria-current={r === current ? "true" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] ${
            r === current ? "border-ink bg-ink text-paper" : "border-line bg-card text-muted hover:border-muted hover:text-ink"
          }`}
        >
          {RANGE_LABEL[r]}
        </Link>
      ))}
    </nav>
  );
}
