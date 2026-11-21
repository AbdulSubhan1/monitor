import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PROJECTS } from "@/lib/projects";

export const metadata: Metadata = { title: "How to read Pulse" };

const BEACON = "https://abdulsubhan-pulse.vercel.app/beacon.js";

function Section({ id, title, intro, children }: { id?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-line bg-card p-5 md:p-6">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {intro && <p className="mt-1 text-[13px] leading-relaxed text-muted">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="grid size-7 flex-none place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium">{title}</h3>
        <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-lg bg-paper p-3 font-mono text-xs leading-relaxed">{children}</pre>;
}

const WORDS: [string, string][] = [
  ["Visitor", "One browser on one device. Counted once in the chosen range, however many pages or days. A new network or browser counts as new. Pulse knows this without cookies."],
  ["Page view", "One page opened. A visitor who opens 5 pages makes 5 page views. Refreshing counts again."],
  ["Event", "Something a visitor did that the site tagged: a click, a form sent, a payment. Scrolling, outside links, downloads and time on page are tracked too, and shown apart."],
  ["Source", "Where a visitor came from: the ?ref= tag on the link, or the site that linked. “Unknown” means typed in, or the link hid it."],
  ["Path", "The order someone opened pages in during one visit. Pulse finds the common ones by itself."],
];

const FAQ: [string, ReactNode][] = [
  [
    "“My site shows 18 page views but only 6 events”",
    "Page views are pages opened, not people, and most people only read. Events count what the site tagged (buttons, forms). Pulse also counts scrolling, sections seen and time on page, under “Tracked automatically” on the Events tab, so reading shows up too.",
  ],
  [
    "“A site has 17 page views, but the link to it got 1 click”",
    "One visit can open several pages: a 5-step journey is 5 page views. So 17 page views may be 3 or 4 people, and the rest may be your own testing. Use “Don't count me” below so your visits stay out.",
  ],
  [
    "“Most of my visitors come from Unknown”",
    <>
      A link with <span className="font-mono">rel=&quot;noreferrer&quot;</span>, or one inside an app like WhatsApp, hides where it came from. Add{" "}
      <span className="font-mono">?ref=name</span> to the links you share (for example <span className="font-mono">?ref=linkedin</span>) and Pulse shows that
      name. On your own sites, use <span className="font-mono">rel=&quot;noopener&quot;</span> instead of noreferrer.
    </>,
  ],
  [
    "“12 months shows only a few weeks”",
    "Pulse keeps daily totals for 13 months, but only since it started collecting them. The chart fills up from then on. Visits, paths and the live feed use the last 60 days kept.",
  ],
  [
    "“A tap I made on my phone isn't counted”",
    "A long-press on a link and “Open in new tab” on a phone can't be seen by any site. Normal taps, clicks, middle-clicks and Ctrl/Cmd+clicks are all counted.",
  ],
  [
    "“The speed says ‘early hint’ or ‘too few loads’”",
    "Speed is the 75th percentile of real page loads. With fewer than 20 loads it's only an early hint (never marked red), and under 5 there's no rating at all.",
  ],
];

export default function GuidePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">How to read Pulse</h1>
        <p className="mt-2 text-[15px] text-muted">Pulse watches every site the same way. Learn one project page and you can read them all.</p>
      </div>

      <Section title="The 2-minute tour">
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Pick a time range">
            24 hours, 7 days, 30 days or 12 months, at the top right. Every number on the page then uses that range; nothing is mixed. Times are in your own
            timezone (change it next to the range).
          </Step>
          <Step n={2} title="Read the story line first">
            The line under the title tells what happened, one story at a time. Each one links to the place that proves it. Hover it to stop it moving.
          </Step>
          <Step n={3} title="Open a project and use the tabs">
            <b>Overview</b> is the summary. <b>Traffic</b>: who came and from where. <b>Events</b>: what they did. <b>Performance</b>: how fast it felt.{" "}
            <b>Uptime</b> and <b>API calls</b>: is it working.
          </Step>
          <Step n={4} title="Look at the colour of the tag">
            Red is a problem, amber is worth a check, blue is an update, green is good news, grey is for your information. Problems always come first.
          </Step>
        </ol>
      </Section>

      <section aria-labelledby="words">
        <h2 id="words" className="mb-3 text-[17px] font-semibold">
          The five words to know
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WORDS.map(([word, meaning]) => (
            <div key={word} className="rounded-xl border border-line bg-card p-4">
              <dt className="font-semibold">{word}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Section title="Why don't my numbers match?">
        <dl className="flex flex-col divide-y divide-line/60">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-sm font-medium">{q}</dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="ignore"
        title="Don't count me"
        intro="Keep your own visits out of the numbers while you test. Open the link for each site once, in each browser and device you use: the site remembers it in that browser only (Pulse itself can't set it for another site). Nothing is sent while it is on."
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROJECTS.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 rounded-lg bg-paper px-3 py-1">
              <span className="text-[13px] font-medium">{p.name}</span>
              <span className="flex gap-3 text-[13px]">
                <a href={`${p.url}/?pulse=ignore`} className="inline-flex min-h-11 items-center underline hover:text-bar">
                  Don&apos;t count me
                </a>
                <a href={`${p.url}/?pulse=count`} className="inline-flex min-h-11 items-center text-muted underline hover:text-ink">
                  Count me again
                </a>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="script" title="Is the Pulse script on the site?" intro="A project with no visitors at all is either quiet, or its script is missing.">
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Open the site in a normal browser window">
            Not on localhost and not in an automated browser: those are never counted. Make sure “Don&apos;t count me” is off for it.
          </Step>
          <Step n={2} title="Look at the project's live feed">
            Events tab → Live feed. Your page view appears within seconds. If it doesn&apos;t, check the page source for the script tag below, with the
            project&apos;s id in <span className="font-mono">data-project</span>.
          </Step>
        </ol>
        <Code>{`<script defer src="${BEACON}" data-project="my-app"></script>`}</Code>
      </Section>

      <Section id="events" title="Add an event" intro="Events are what people did on the site. Automatic tracking already covers scrolling, outside links, downloads and time on page.">
        <p className="text-[13px] leading-relaxed text-muted">On any button or link, no code:</p>
        <Code>{`<a href="/signup" data-pulse-event="signup_clicked" data-pulse-label="hero">Sign up</a>`}</Code>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">Or from code, for things like a form that was sent:</p>
        <Code>{`window.pulse?.track("quote_form_submitted", "car"); // snake_case name, optional label`}</Code>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Names show in plain words: <span className="font-mono">quote_form_submitted</span> becomes “Quote form sent”.
        </p>
      </Section>

      <Section title="Add a new project" intro="Every project gets the same tabs and the same stories. Two steps, nothing else to set up.">
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Add it to Pulse's project list">
            One entry in <span className="font-mono">src/lib/projects.ts</span>:
            <Code>{`{ id: "my-app", name: "My App", url: "https://my-app.vercel.app", checkPath: "/",
  origins: ["https://my-app.vercel.app"], deploys: { from: "vercel", projectId: "prj_..." } }`}</Code>
          </Step>
          <Step n={2} title="Put one script tag on the site">
            <Code>{`<script defer src="${BEACON}" data-project="my-app"></script>`}</Code>
            Page views, visitors, sources, scrolling, outside links, downloads, speed and errors work from here.
          </Step>
        </ol>
      </Section>

      <p className="text-[13px] leading-relaxed text-muted">
        Privacy: no cookies on your sites and no stored IP. Visitors are a keyed hash kept 60 days, so Pulse can tell a returning browser, never who it
        is. <Link href="/" className="underline hover:text-ink">Back to all projects</Link>
      </p>
    </div>
  );
}
