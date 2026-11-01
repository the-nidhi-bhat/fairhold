import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { canAccessDeal, getDemoSession } from "@/lib/auth/session";
import { listDeals } from "@/lib/data";
import { formatCents } from "@/lib/domain/format";
import {
  computeProgress,
  paymentStatusFor,
  summarizePaymentStatuses,
} from "@/lib/domain/status";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge, dealStatusTone } from "@/components/status-badge";

export const metadata = { title: "Dashboard" };
export const instant = false;

export default async function DashboardPage() {
  if (!(await getDemoSession())) redirect("/login");
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Active deals and milestone progress.
          </p>
        </div>
        <Link
          href="/deals/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          New deal
        </Link>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  await connection();
  const session = await getDemoSession();
  const allDeals = await listDeals();
  const deals = session
    ? allDeals.filter((deal) => canAccessDeal(session, deal))
    : [];

  if (deals.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          No deals yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
          Create a deal with an agreement and milestones to get started. Deals
          use development-only storage while the database is being built.
        </p>
        <Link
          href="/deals/new"
          className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create your first deal
        </Link>
      </section>
    );
  }

  const active = deals.filter(
    (deal) => deal.status !== "Completed" && deal.status !== "Cancelled",
  );
  const totalValueCents = deals.reduce(
    (sum, deal) => sum + computeProgress(deal).totalCents,
    0,
  );
  const completedMilestones = deals.reduce(
    (sum, deal) => sum + computeProgress(deal).completed,
    0,
  );
  const paymentSummary = summarizePaymentStatuses(deals);

  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryStat label="Deals" value={String(deals.length)} />
        <SummaryStat label="Active" value={String(active.length)} />
        <SummaryStat
          label="Total value"
          value={formatCents(totalValueCents)}
        />
        <SummaryStat
          label="Milestones done"
          value={String(completedMilestones)}
        />
      </dl>

      <section
        className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"
        aria-labelledby="payment-summary-heading"
      >
        <div>
          <h2
            id="payment-summary-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-50"
          >
            Payment summary
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Current authorization state across all deals.
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <PaymentSummaryStat
            label="Needs authorization"
            value={paymentSummary.not_authorized}
            tone="neutral"
          />
          <PaymentSummaryStat
            label="Buyer approval pending"
            value={paymentSummary.authorization_pending}
            tone="warning"
          />
          <PaymentSummaryStat
            label="Sandbox authorized"
            value={paymentSummary.authorization_sandbox}
            tone="success"
          />
          <PaymentSummaryStat
            label="Simulated authorized"
            value={paymentSummary.authorization_simulated}
            tone="warning"
          />
          <PaymentSummaryStat
            label="No payment"
            value={paymentSummary.no_payment}
            tone="neutral"
          />
        </dl>
      </section>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        All deals
      </h2>
      <ul className="mt-4 space-y-4">
        {deals.map((deal) => {
          const progress = computeProgress(deal);
          const payment = paymentStatusFor(deal);
          return (
            <li key={deal.id}>
              <Link
                href={`/deals/${deal.id}`}
                className="block rounded-xl border border-slate-200 p-5 transition hover:border-indigo-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-indigo-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">
                      {deal.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {deal.clientName} &rarr; {deal.freelancerName}
                    </p>
                  </div>
                  <StatusBadge
                    label={deal.status}
                    tone={dealStatusTone(deal.status)}
                  />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <ProgressBar
                    percent={progress.percent}
                    label={`${deal.title} milestone progress`}
                  />
                  <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    {progress.completed}/{progress.total} · {progress.percent}%
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    Total{" "}
                    <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                      {formatCents(progress.totalCents, deal.currency)}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      payment.tone === "warning"
                        ? "text-amber-700 dark:text-amber-400"
                        : undefined
                    }
                  >
                    {payment.label}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
        {value}
      </dd>
    </div>
  );
}

function PaymentSummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "success";
}) {
  const dotTone = {
    neutral: "bg-slate-400 dark:bg-slate-500",
    warning: "bg-amber-500",
    success: "bg-emerald-500",
  }[tone];

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <dt className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
        <span className={`h-2 w-2 rounded-full ${dotTone}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
        {value}
      </dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 animate-pulse space-y-4" aria-hidden="true">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>
      <div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
