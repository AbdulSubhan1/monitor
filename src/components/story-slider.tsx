"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The one-line story slider on every screen. The stories come from the server (src/lib/stories.ts); this only shows
// them one at a time. The only client JavaScript in the dashboard.

export type SlideTone = "red" | "amber" | "blue" | "green" | "gray";
export type Slide = { id: string; tone: SlideTone; tag: string; title: string; line: string; link: string; href: string };

const SHOW_MS = 6500;
const LONG_EXTRA_MS = 1500;
const LONG_LINE = 110;
const TICK_MS = 100;
const REFRESH_MS = 5 * 60_000;

const TONE: Record<SlideTone, { ink: string; bar: string; dot: string; dotSoft: string }> = {
  red: { ink: "text-down-ink", bar: "bg-down", dot: "bg-down", dotSoft: "bg-down/40" },
  amber: { ink: "text-warn-ink", bar: "bg-warn", dot: "bg-warn", dotSoft: "bg-warn/40" },
  blue: { ink: "text-bar-ink", bar: "bg-bar", dot: "bg-bar", dotSoft: "bg-bar/40" },
  green: { ink: "text-up-ink", bar: "bg-up", dot: "bg-up", dotSoft: "bg-up/40" },
  gray: { ink: "text-muted-ink", bar: "bg-muted", dot: "bg-muted", dotSoft: "bg-muted/40" },
};

const showFor = (s: Slide) => SHOW_MS + (s.title.length + s.line.length > LONG_LINE ? LONG_EXTRA_MS : 0);

type View = { list: Slide[]; pending: Slide[] | null; index: number; elapsed: number; userMoved: boolean };

// 100 ms on; when the story's time is up, the next one (from the refreshed list if one arrived)
function tick(v: View): View {
  const current = v.list[v.index];
  if (!current) return v;
  const elapsed = v.elapsed + TICK_MS;
  if (elapsed < showFor(current)) return { ...v, elapsed };
  if (v.pending) {
    const at = v.pending.findIndex((s) => s.id === current.id);
    return { list: v.pending, pending: null, index: v.pending.length ? (at + 1) % v.pending.length : 0, elapsed: 0, userMoved: false };
  }
  return { ...v, index: (v.index + 1) % v.list.length, elapsed: 0, userMoved: false };
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const reducedMotionNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const hiddenNow = () => document.visibilityState === "hidden";

export function StorySlider({ stories, label, failed, retryHref }: { stories: Slide[]; label: string; failed?: boolean; retryHref: string }) {
  const router = useRouter();
  // One state object so a tick can finish a story and move on in the same update
  const [view, setView] = useState<View>({ list: stories, pending: null, index: 0, elapsed: 0, userMoved: false });
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seenStories, setSeenStories] = useState(stories);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false);
  const hidden = useSyncExternalStore(subscribeVisibility, hiddenNow, () => false);
  const touchX = useRef<number | null>(null);

  // A refreshed list from the server waits until the current story has finished
  if (stories !== seenStories) {
    setSeenStories(stories);
    setView((v) => ({ ...v, pending: stories }));
  }

  const { list, index, elapsed, userMoved } = view;
  const count = list.length;
  const current = list[Math.min(index, count - 1)];
  const autoplay = count > 1 && !reduced;
  const running = autoplay && !paused && !hover && !focused && !hidden;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setView(tick), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  // Left open, the page re-fetches its data every 5 minutes (stories included)
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  function go(i: number) {
    // Announce only what the user chose; autoplay stays silent for screen readers
    setView((v) => ({ ...v, index: ((i % v.list.length) + v.list.length) % v.list.length, elapsed: 0, userMoved: true }));
  }

  if (failed) {
    return (
      <section aria-label={label} className="rounded-xl border border-line bg-card px-5 py-4 text-sm">
        <p className="font-medium">Couldn&apos;t load stories.</p>
        <p className="mt-1 text-muted">
          The data did not load, so nothing is shown rather than a wrong number.{" "}
          <a href={retryHref} className="font-medium text-ink underline">
            Try again
          </a>
        </p>
      </section>
    );
  }

  if (count === 0) {
    return (
      <section aria-label={label} className="flex min-h-14 items-center gap-2 rounded-xl border border-line bg-card px-5 py-3 text-sm">
        <span className="size-2 rounded-full bg-up" aria-hidden />
        <span className="font-semibold text-up-ink">All good.</span>
        <span className="text-muted">Nothing needs your attention in this range.</span>
      </section>
    );
  }

  const tone = TONE[current.tone];
  const progress = autoplay ? Math.min(100, (elapsed / showFor(current)) * 100) : 0;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="overflow-hidden rounded-xl border border-line bg-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null || count < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div
        key={current.id}
        className={`flex min-h-[92px] flex-col justify-center gap-1 px-5 py-3.5 ${autoplay ? "story-in" : ""}`}
        aria-live={userMoved ? "polite" : "off"}
        aria-atomic="true"
        role="group"
        aria-roledescription="story"
        aria-label={`${index + 1} of ${count}`}
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`live-dot size-2 rounded-full ${tone.dot}`} aria-hidden />
          <span className={`font-semibold tracking-wider ${tone.ink}`}>{current.tag}</span>
          {count > 1 && (
            <span className="font-mono text-muted tabular-nums">
              {index + 1}/{count}
            </span>
          )}
          {autoplay && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play stories" : "Pause stories"}
              className="-my-3.5 -ml-2 inline-grid size-11 place-items-center rounded-full text-muted hover:bg-paper hover:text-ink"
            >
              {paused ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M7 4v16l13-8z" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              )}
            </button>
          )}
        </div>
        <h2 className="text-lg leading-snug font-semibold">{current.title}</h2>
        <p className="text-[13px] leading-normal text-muted-ink">
          {current.line}{" "}
          <Link href={current.href} className="font-medium whitespace-nowrap text-ink underline-offset-2 hover:underline">
            {current.link} →
          </Link>
        </p>
      </div>
      {count > 1 && (
        <>
          <div className="h-[3px] bg-paper" aria-hidden>
            <div className={`h-full ${tone.bar}`} style={{ width: `${progress}%` }} />
          </div>
          {/* Each dot is a 44 px tap target; the negative margin keeps the row as short as the dots look */}
          <div role="tablist" aria-label="Choose a story" className="flex flex-wrap px-2.5 py-0.5">
            {list.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={s.title}
                onClick={() => go(i)}
                className="-my-2.5 grid h-11 w-11 place-items-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-[width] duration-300 ${i === index ? `w-7 ${TONE[s.tone].dot}` : `w-2.5 ${TONE[s.tone].dotSoft}`}`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
