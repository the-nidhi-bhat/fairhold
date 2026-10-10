import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
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
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
            <Link
              href="/"
              className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              FairHold
            </Link>
            <nav
              className="flex items-center gap-3 text-sm sm:gap-4"
              aria-label="Primary"
            >
              <Link
                href="/dashboard"
                className="font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
              >
                Dashboard
              </Link>
              <Link
                href="/deals/new"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
              >
                New deal
              </Link>
              <span className="hidden rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-700 dark:text-amber-400 sm:inline-block">
                Under development
              </span>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto w-full max-w-5xl space-y-2 px-6 py-6 text-sm text-slate-600 dark:text-slate-400">
            <p>
              FairHold is under active development. Deals and milestones use
              development-only storage; authentication and AI analysis are not
              implemented yet. Payment runs against a simulated demo adapter
              unless PayPal sandbox credentials are configured.
            </p>
            <p>
              PayPal is used as the payment infrastructure. FairHold does not
              claim that PayPal provides native escrow for this application.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
