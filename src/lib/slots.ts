const SLOT_MS = 10 * 60_000;
export const SLOTS_24H = 144;

type Check = { ok: boolean; at: Date; status: number | null; error: string | null; ms: number };
export type Slot = { ok: boolean; label: string } | null;

// Places each check in its 10-minute slot of the last 24 hours. A slot with no check stays null (shown grey), so a
// gap in the scheduler is visible instead of being hidden. If two checks share a slot, a failure wins.
export function toSlots(checks: Check[], now = Date.now(), clock: (d: Date) => string = (d) => `${d.toISOString().slice(11, 16)} UTC`): Slot[] {
  const start = now - SLOTS_24H * SLOT_MS;
  const slots: Slot[] = Array.from({ length: SLOTS_24H }, () => null);
  for (const c of checks) {
    const i = Math.floor((c.at.getTime() - start) / SLOT_MS);
    if (i < 0 || i >= SLOTS_24H) continue;
    if (slots[i] && !slots[i].ok) continue;
    const time = clock(c.at);
    const label = c.ok ? `${time} · ${c.status} in ${c.ms} ms` : `${time} · down: ${c.error ?? `HTTP ${c.status}`}`;
    slots[i] = { ok: c.ok, label };
  }
  return slots;
}

export type UptimeBar = { key: string; ok: number; total: number; label: string } | null;

// Uptime over a longer range: one bar per bucket (hours of the last 7 days, or days), in the viewer's timezone.
// A bar is the share of good checks in it; null where no check ran.
export function uptimeBars(checks: Check[], buckets: { start: Date; label: string }[]): UptimeBar[] {
  const bars = buckets.map(() => ({ ok: 0, total: 0 }));
  for (const c of checks) {
    const t = c.at.getTime();
    let i = -1;
    for (let j = buckets.length - 1; j >= 0; j--) {
      if (t >= buckets[j].start.getTime()) {
        i = j;
        break;
      }
    }
    if (i < 0) continue;
    bars[i].total++;
    if (c.ok) bars[i].ok++;
  }
  return bars.map((b, i) =>
    b.total ? { key: buckets[i].start.toISOString(), ok: b.ok, total: b.total, label: `${buckets[i].label} · ${b.ok} of ${b.total} checks good` } : null,
  );
}
