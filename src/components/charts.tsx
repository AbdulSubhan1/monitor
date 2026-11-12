// Tiny SVG charts: no chart library for a handful of bars.

type Bar = { label: string; value: number };

// Daily page views. Each bar has a <title> so hovering shows the day and count.
export function DayBars({ bars, height = 40 }: { bars: Bar[]; height?: number }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const width = bars.length * 12;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" preserveAspectRatio="none" role="img" aria-label="Page views per day, last 7 days">
      {bars.map((b, i) => {
        const h = b.value === 0 ? 1.5 : Math.max(3, (b.value / max) * height);
        return (
          <rect key={b.label} x={i * 12 + 1} y={height - h} width={10} height={h} rx={1.5} className={b.value ? "fill-bar" : "fill-bar-soft"}>
            <title>{`${b.label}: ${b.value} views`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

type Slot = { ok: boolean; label: string } | null;

// Uptime over 24 h: one thin bar per 10-minute check, grey where no check ran
export function UptimeStrip({ slots }: { slots: Slot[] }) {
  return (
    <svg viewBox={`0 0 ${slots.length * 3} 24`} className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label="Uptime checks, last 24 hours">
      {slots.map((s, i) => (
        <rect key={i} x={i * 3} y={0} width={2.2} height={24} rx={0.6} className={s === null ? "fill-line" : s.ok ? "fill-up" : "fill-down"}>
          {s && <title>{s.label}</title>}
        </rect>
      ))}
    </svg>
  );
}
