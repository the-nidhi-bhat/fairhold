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
    default: "FairHold — AI proposes. Rules decide.",
    template: "%s | FairHold",
  },
  description:
    "FairHold is an AI-assisted conditional payment platform for buyer-seller transactions, in active development. AI interprets agreements and evidence; deterministic rules make the final decision.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="site-shell flex min-h-full flex-col bg-background text-foreground">
        <header className="site-header sticky top-0 z-40">
          <div className="page-frame flex h-[68px] items-center justify-between gap-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-[-0.04em] text-[var(--foreground)]"
            >
              FairHold
            </Link>
            <nav
              className="flex items-center gap-3 text-sm sm:gap-4"
              aria-label="Primary"
            >
              <Link
                href="/dashboard"
                className="hidden font-medium text-muted transition hover:text-[var(--foreground)] sm:inline"
              >
                Dashboard
              </Link>
              <Link
                href="/deals/new"
                className="primary-button min-h-9 px-3.5 py-2"
              >
                New deal
              </Link>
              <Suspense fallback={<span className="text-sm text-slate-500">Account</span>}>
                <SessionNavigation />
              </Suspense>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-[var(--border)]">
          <div className="page-frame grid gap-2 py-7 text-xs leading-5 text-muted sm:grid-cols-[1fr_auto]">
            <p>Demo workspace. Payment actions may be simulated and are not escrow.</p>
            <p>FairHold does not provide investment, legal, or financial advice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
