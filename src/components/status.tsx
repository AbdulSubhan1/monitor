type State = "up" | "down" | "unknown";

const STYLES: Record<State, { pill: string; dot: string; text: string }> = {
  up: { pill: "bg-up-soft text-up", dot: "bg-up", text: "Up" },
  down: { pill: "bg-down-soft text-down", dot: "bg-down", text: "Down" },
  unknown: { pill: "bg-line text-muted", dot: "bg-muted", text: "No checks yet" },
};

export function StatusPill({ state }: { state: State }) {
  const s = STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pill}`}>
      <span className={`size-1.5 rounded-full ${s.dot} ${state === "up" ? "animate-pulse" : ""}`} aria-hidden />
      {s.text}
    </span>
  );
}

const LEVEL_STYLES: Record<string, string> = {
  error: "bg-down-soft text-down",
  warn: "bg-warn-soft text-warn",
  info: "bg-bar-soft text-bar",
  debug: "bg-line text-muted",
};

export function LevelTag({ level }: { level: string }) {
  return (
    <span className={`inline-block w-12 rounded px-1.5 py-0.5 text-center font-mono text-[11px] uppercase ${LEVEL_STYLES[level] ?? LEVEL_STYLES.debug}`}>
      {level}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "down" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-mono text-lg tabular-nums ${tone === "down" ? "text-down" : ""}`}>{value}</dd>
    </div>
  );
}
