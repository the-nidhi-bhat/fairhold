import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { canAccessDeal, getDemoSession } from "@/lib/auth/session";
import { listDeals } from "@/lib/data";
import { isPostgresConfigured } from "@/lib/data/db";
import { DEAL_STATUSES, type DealStatus } from "@/lib/domain/types";
import { formatCents } from "@/lib/domain/format";
import {
  computeProgress,
  paymentStatusFor,
  summarizePaymentStatuses,
} from "@/lib/domain/status";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge, dealStatusTone } from "@/components/status-badge";
import { summarizeDashboardWorkflow } from "@/lib/domain/workflow";

export const metadata = { title: "Dashboard" };
export const instant = false;

const ROLE_FRAMING: Record<string, { eyebrow: string; line: string }> = {
  buyer: {
    eyebrow: "Buyer workspace",
    line: "Review evidence, record decisions and approve payment progress.",
  },
  seller: {
    eyebrow: "Seller workspace",
    line: "Deliver against agreed criteria and keep every submission documented.",
  },
  reviewer: {
    eyebrow: "Reviewer workspace",
    line: "Review only the deals explicitly granted to you.",
  },
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await getDemoSession();
  if (!session) redirect("/login");
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "all";
  const canCreate = session.role !== "reviewer";
  const framing = ROLE_FRAMING[session.role] ?? ROLE_FRAMING.reviewer;
  return (
    <div className="page-frame py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{framing.eyebrow}</p>
          <h1 className="headline mt-3 text-[clamp(2rem,4vw,2.75rem)]">
            Dashboard
          </h1>
          <p className="mt-2 max-w-[52ch] text-sm leading-6 text-muted">
            {framing.line}
          </p>
        </div>
        {canCreate ? (
          <Link href="/deals/new" className="primary-button">
            New deal
          </Link>
        ) : null}
      </header>

      <details className="surface mt-6 p-5 sm:p-6">
        <summary className="cursor-pointer text-sm font-medium text-[var(--foreground-soft)]">
          New here? How FairHold works in four steps
        </summary>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Agree",
              "Write the scope and split it into milestones, each with acceptance criteria and an amount.",
            ],
            [
              "Hold",
              "The buyer places an authorization hold. It reserves funds; it is not escrow and moves no money.",
            ],
            [
              "Prove",
              "The seller submits evidence and a link. The buyer accepts it or asks for a specific change.",
            ],
            [
              "Approve",
              "A human approves. Only then does the provider capture that milestone; the audit trail records it.",
            ],
          ].map(([title, body], index) => (
            <li key={title}>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
                Step {index + 1}
              </span>
              <p className="mt-1 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-5 text-muted">
          No database configured? The{" "}
          <Link href="/demo" className="text-[var(--accent)] underline underline-offset-4">
            guided demo
          </Link>{" "}
          runs the same rules engine in your browser with simulated payments.
        </p>
      </details>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent search={search} status={status} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  await connection();
  const session = await getDemoSession();
  const allDeals = await listDeals();
  const deals = session
    ? allDeals.filter((deal) => canAccessDeal(session, deal))
    : [];

  if (deals.length === 0) {
    const canCreate = session?.role !== "reviewer";
    return (
      <section className="surface mt-10 p-8 sm:p-10">
        <p className="section-label">Empty workspace</p>
        <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em]">
          No deals yet
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
          {isPostgresConfigured()
            ? "Create a deal with an agreement and milestones to get started. Deals are stored in the configured PostgreSQL database."
            : "Create a deal with an agreement and milestones to get started. Deals use the development JSON store while no database is configured."}
        </p>
        {canCreate ? (
          <Link href="/deals/new" className="primary-button mt-6">
            Create your first deal
          </Link>
        ) : (
          <p className="mt-6 max-w-lg text-sm leading-6 text-muted">
            Ask a buyer or seller to create a deal, then grant your reviewer
            identity access to it.
          </p>
        )}
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
  const workflow = summarizeDashboardWorkflow(deals, session!.role);

  const statusFilter: DealStatus | "all" = (
    DEAL_STATUSES as readonly string[]
  ).includes(status)
    ? (status as DealStatus)
    : "all";
  const needle = search.trim().toLowerCase();
  const visibleDeals = deals.filter((deal) => {
    if (statusFilter !== "all" && deal.status !== statusFilter) return false;
    if (!needle) return true;
    return (
      deal.title.toLowerCase().includes(needle) ||
      deal.clientName.toLowerCase().includes(needle) ||
      deal.freelancerName.toLowerCase().includes(needle) ||
      deal.milestones.some(
        (milestone) =>
          milestone.title.toLowerCase().includes(needle) ||
          milestone.acceptanceCriteria.toLowerCase().includes(needle),
      )
    );
  });
  const filtersActive = needle !== "" || statusFilter !== "all";
  const openItems =
    session!.role === "buyer"
      ? workflow.pendingReviews.length
      : workflow.rejectedEvidence.length + workflow.assignedMilestones.length;

  return (
    <>
      {session!.role === "buyer" || session!.role === "seller" ? (
        <section className="surface mt-8 p-5 sm:p-6" aria-labelledby="workflow-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label text-[var(--accent)]">
                {session!.role === "buyer" ? "Buyer queue" : "Seller queue"}
              </p>
              <h2
                id="workflow-heading"
                className="mt-2 text-xl font-semibold tracking-[-0.02em]"
              >
                {session!.role === "buyer"
                  ? "What needs your review"
                  : "Work that needs attention"}
              </h2>
            </div>
            <span className="chip hidden sm:inline-flex">
              {openItems} {session!.role === "buyer" ? "awaiting your decision" : "need attention"}
            </span>
          </div>
          {session!.role === "buyer" ? (
            workflow.pendingReviews.length === 0 ? (
              <p className="mt-5 text-sm text-muted">
                No submitted evidence is waiting for your review.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--hairline)]">
                {workflow.pendingReviews.slice(0, 5).map((item) => (
                  <li
                    key={item.evidenceId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.milestoneTitle}</p>
                      <p className="mt-1 text-xs text-muted">{item.deal.title}</p>
                    </div>
                    <Link
                      href={`/deals/${item.deal.id}`}
                      className="secondary-button shrink-0"
                    >
                      Review evidence
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : workflow.assignedMilestones.length === 0 &&
            workflow.rejectedEvidence.length === 0 ? (
            <p className="mt-5 text-sm text-muted">
              No active milestones or rejected evidence need attention.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--hairline)]">
              {workflow.rejectedEvidence.slice(0, 3).map((item) => (
                <li
                  key={item.evidenceId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {item.milestoneTitle}
                    </p>
                    <p className="mt-1 text-xs text-[var(--danger)]">
                      Buyer feedback on {item.deal.title}
                    </p>
                  </div>
                  <Link
                    href={`/deals/${item.deal.id}`}
                    className="secondary-button shrink-0"
                  >
                    View feedback
                  </Link>
                </li>
              ))}
              {workflow.assignedMilestones.slice(0, 5).map((item) => (
                <li
                  key={item.milestoneId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.milestoneTitle}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.status}
                      {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/deals/${item.deal.id}`}
                    className="secondary-button shrink-0"
                  >
                    Open milestone
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryStat label="Deals" value={String(deals.length)} />
        <SummaryStat label="Active" value={String(active.length)} />
        <SummaryStat label="Total value" value={formatCents(totalValueCents)} />
        <SummaryStat label="Milestones done" value={String(completedMilestones)} />
      </dl>

      <section
        className="surface mt-6 p-5 sm:p-6"
        aria-labelledby="payment-summary-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="payment-summary-heading"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              Payment summary
            </h2>
            <p className="mt-1 text-sm text-muted">
              Current authorization state across all deals.
            </p>
          </div>
          <span className="code-chip">Holds, not escrow</span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
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

      <form
        action="/dashboard"
        method="get"
        className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end"
        role="search"
        aria-label="Find deals"
      >
        <div className="min-w-0 flex-1">
          <label
            htmlFor="deal-search"
            className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted"
          >
            Search deals
          </label>
          <input
            id="deal-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Title, counterparty or milestone"
            className="field mt-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="deal-status-filter"
            className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted"
          >
            Status
          </label>
          <select
            id="deal-status-filter"
            name="status"
            defaultValue={statusFilter}
            className="field mt-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            {DEAL_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="secondary-button">
            Apply
          </button>
          {filtersActive ? (
            <Link href="/dashboard" className="ghost-button px-3 text-sm">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <div className="mt-6 flex items-end justify-between gap-4">
        <h2 className="section-label">All deals</h2>
        <p className="text-xs text-muted">
          {filtersActive
            ? `${visibleDeals.length} of ${deals.length} shown`
            : `${deals.length} ${deals.length === 1 ? "record" : "records"}`}
        </p>
      </div>

      {visibleDeals.length === 0 ? (
        <div className="surface mt-4 p-8 text-center">
          <p className="text-sm font-medium">No deals match those filters</p>
          <p className="mt-1 text-xs text-muted">
            Try a different search term or status.
          </p>
          <Link href="/dashboard" className="secondary-button mt-4 inline-flex">
            Clear filters
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visibleDeals.map((deal) => {
          const progress = computeProgress(deal);
          const payment = paymentStatusFor(deal);
          return (
            <li key={deal.id}>
              <Link
                href={`/deals/${deal.id}`}
                className="panel panel-hover block p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold tracking-[-0.015em] text-[var(--foreground)]">
                      {deal.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {deal.clientName} &rarr; {deal.freelancerName}
                    </p>
                  </div>
                  <StatusBadge
                    label={deal.status}
                    tone={dealStatusTone(deal.status)}
                  />
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <ProgressBar
                    percent={progress.percent}
                    label={`${deal.title} milestone progress`}
                  />
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {progress.completed}/{progress.total} · {progress.percent}%
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span>
                    Total{" "}
                    <span className="font-medium tabular-nums text-[var(--foreground-soft)]">
                      {formatCents(progress.totalCents, deal.currency)}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      payment.tone === "warning"
                        ? "text-[var(--warning)]"
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
      )}
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-subtle p-4 sm:p-5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </dt>
      <dd className="mt-2 text-xl font-semibold tabular-nums tracking-[-0.02em] text-[var(--foreground)] sm:text-2xl">
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
    neutral: "bg-[var(--muted)]",
    warning: "bg-[var(--warning)]",
    success: "bg-[var(--success)]",
  }[tone];

  return (
    <div className="surface-inset p-3.5">
      <dt className="flex items-center gap-2 text-[11px] font-medium leading-4 text-muted">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-xl font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-hidden="true">
      <div className="surface h-28 animate-pulse" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="surface h-24 animate-pulse" />
        ))}
      </div>
      <div className="surface h-28 animate-pulse" />
      <div className="surface h-32 animate-pulse" />
    </div>
  );
}
