import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionNavigation } from "@/components/session-navigation";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FairHold — Work moves forward. Payments move with proof.",
    template: "%s | FairHold",
  },
  description:
    "FairHold coordinates agreements, milestones, evidence and payment progress for buyer-seller work. AI advises; deterministic rules decide; people approve.",
  applicationName: "FairHold",
  openGraph: {
    title: "FairHold — Work moves forward. Payments move with proof.",
    description:
      "Coordinate milestones, review evidence and manage payment progress with clarity at every step.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="site-shell flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface-raised)] focus:px-4 focus:py-3 focus:text-sm focus:text-[var(--foreground)] min-h-[44px] min-w-[44px]"
        >
          Skip to content
        </a>
        <header className="site-header sticky top-0 z-40">
          <div className="page-frame flex h-[70px] items-center justify-between gap-4">
            <Link
              href="/"
              className="group flex items-center gap-2.5"
              aria-label="FairHold home"
            >
              <svg
                className="h-7 w-7 fill-current"
                viewBox="0 0 400 100"
                width="28"
                height="28"
                aria-hidden="true"
              >
                <use href="/shield-wordmark.svg" />
              </svg>
              <span className="text-[17px] font-semibold tracking-[-0.045em] text-[var(--foreground)]">
                FairHold
              </span>
            </Link>
            <nav
              className="flex items-center gap-1.5 text-sm sm:gap-3"
              aria-label="Primary"
            >
              <Link
                href="/dashboard"
                className="hidden min-h-11 items-center rounded-lg px-3 font-medium text-muted transition hover:bg-white/5 hover:text-[var(--foreground)] sm:inline-flex"
              >
                Dashboard
              </Link>
              <Link
                href="/deals/new"
                className="primary-button min-h-11 px-3.5 py-2 text-[13px]"
              >
                New deal
              </Link>
              <Suspense
                fallback={
                  <span className="px-1 text-sm text-muted" aria-hidden="true">
                    Account
                  </span>
                }
              >
                <SessionNavigation />
              </Suspense>
            </nav>
          </div>
        </header>

        <main id="main" className="relative flex-1">
          {children}
        </main>

        <footer className="site-footer">
          <div className="page-frame grid gap-6 py-10 text-xs leading-5 text-muted sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="text-[13px] font-semibold tracking-[-0.02em] text-[var(--foreground-soft)]">
                FairHold
              </p>
              <p className="mt-2 max-w-sm">
                A proof-backed workflow for buyer-seller work. Demo workspace:
                payment actions may be simulated, and an authorization is a
                provider hold, never escrow.
              </p>
            </div>
            <div>
              <p className="section-label">Product</p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <Link className="min-h-11 inline-flex items-center hover:text-[var(--foreground)]" href="/dashboard">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link className="min-h-11 inline-flex items-center hover:text-[var(--foreground)]" href="/deals/new">
                    Create a deal
                  </Link>
                </li>
                <li>
                  <Link className="min-h-11 inline-flex items-center hover:text-[var(--foreground)]" href="/login">
                    Demo sign in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="section-label">Boundaries</p>
              <ul className="mt-2 space-y-1.5">
                <li>AI proposes; people approve.</li>
                <li>Rules decide; code records why.</li>
                <li>No investment, legal or financial advice.</li>
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
