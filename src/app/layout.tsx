import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Pulse · my live projects", template: "%s · Pulse" },
  description: "Uptime, traffic, errors and deploys for Abdul Subhan's live projects, on one page.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh font-sans">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 md:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="size-2.5 rounded-full bg-up" aria-hidden />
              Pulse
            </Link>
            <Link href="/" className="text-sm text-muted hover:text-ink">
              Overview
            </Link>
            <Link href="/logs" className="text-sm text-muted hover:text-ink">
              Logs
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted md:px-6">
          A small monitor I built for my own projects: uptime every 10 minutes, a cookie-free beacon, and an error log.{" "}
          <a className="underline hover:text-ink" href="https://github.com/AbdulSubhan1/monitor">
            Code on GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
