import Link from "next/link";

// A filter or tab as a plain link, so every view has a shareable URL and needs no client JavaScript
export function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs ${active ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-muted hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export function LogTabs({ current }: { current: "logs" | "api" }) {
  return (
    <div className="mb-5 flex gap-4 border-b border-line text-sm">
      {(
        [
          ["logs", "/logs", "Errors and logs"],
          ["api", "/logs/api", "API calls"],
        ] as const
      ).map(([key, href, text]) => (
        <Link
          key={key}
          href={href}
          className={`-mb-px border-b-2 pb-2 ${current === key ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}
        >
          {text}
        </Link>
      ))}
    </div>
  );
}
