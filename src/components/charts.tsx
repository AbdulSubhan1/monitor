// Tiny SVG charts: no chart library for a handful of bars.

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
