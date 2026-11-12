const SLOT_MS = 10 * 60_000;
export const SLOTS_24H = 144;

type Check = { ok: boolean; at: Date; status: number | null; error: string | null; ms: number };
export type Slot = { ok: boolean; label: string } | null;

// Places each check in its 10-minute slot of the last 24 hours. A slot with no check stays null (shown grey), so a
// gap in the scheduler is visible instead of being hidden. If two checks share a slot, a failure wins.
export function toSlots(checks: Check[], now = Date.now()): Slot[] {
  const start = now - SLOTS_24H * SLOT_MS;
  const slots: Slot[] = Array.from({ length: SLOTS_24H }, () => null);
  for (const c of checks) {
    const i = Math.floor((c.at.getTime() - start) / SLOT_MS);
    if (i < 0 || i >= SLOTS_24H) continue;
    if (slots[i] && !slots[i].ok) continue;
    const time = c.at.toISOString().slice(11, 16);
    const label = c.ok ? `${time} UTC · ${c.status} in ${c.ms} ms` : `${time} UTC · down: ${c.error ?? `HTTP ${c.status}`}`;
    slots[i] = { ok: c.ok, label };
  }
  return slots;
}
