import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { formatCents } from "@/lib/domain/format";
import { approvalIsStale, recommendMilestone } from "@/lib/domain/rules";
import {
  allowedManualDealTransitions,
  allowedMilestoneTransitions,
  computeProgress,
  paymentStatusFor,
} from "@/lib/domain/status";
import type {
  Deal,
  DealEvent,
  EvidenceDecision,
  Milestone,
  RecommendationAction,
} from "@/lib/domain/types";
import { ProgressBar } from "@/components/progress-bar";
import {
  StatusBadge,
  dealStatusTone,
  milestoneStatusTone,
  type BadgeTone,
} from "@/components/status-badge";
import {
  authorizeDealAction,
  changeDealStatusAction,
  changeMilestoneStatusAction,
} from "../actions";
import { AddMilestoneForm, EditMilestoneForm } from "./milestone-forms";
import {
  AddEvidenceForm,
  ApprovalPanel,
  ReviewEvidenceForm,
} from "./evidence-forms";

export const metadata = { title: "Deal" };

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
      >
        &larr; Dashboard
      </Link>
      <Suspense fallback={<DealSkeleton />}>
        {params.then(({ id }) => (
          <DealDetail id={id} />
        ))}
      </Suspense>
    </div>
  );
}

async function DealDetail({ id }: { id: string }) {
  await connection();
  const deal = await getDeal(id);
  if (!deal) notFound();

  const progress = computeProgress(deal);
  const payment = paymentStatusFor(deal);
  const dealTransitions = allowedManualDealTransitions(deal.status);
  const canAddMilestones =
    deal.status !== "Completed" && deal.status !== "Cancelled";
  const timeline = [...deal.events].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <>
      <header className="mt-4 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {deal.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {deal.clientName} &rarr; {deal.freelancerName}
            </p>
          </div>
          <StatusBadge
            label={deal.status}
            tone={dealStatusTone(deal.status)}
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <ProgressBar
            percent={progress.percent}
            label={`${deal.title} milestone progress`}
          />
          <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {progress.completed}/{progress.total} · {progress.percent}%
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Total
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {formatCents(progress.totalCents, deal.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Completed
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {formatCents(progress.completedCents, deal.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Created
            </dt>
            <dd className="mt-0.5 text-slate-700 dark:text-slate-300">
              {formatDate(deal.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Currency
            </dt>
            <dd className="mt-0.5 text-slate-700 dark:text-slate-300">
              {deal.currency}
            </dd>
          </div>
        </dl>
      </header>

      {/* Payment state — explicit and never overstated */}
      <section className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Payment
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {payment.detail}
            </p>
          </div>
          <StatusBadge label={payment.label} tone={payment.tone} />
        </div>

        {deal.status === "Ready for Authorization" ? (
          <form action={authorizeDealAction} className="mt-4">
            <input type="hidden" name="dealId" value={deal.id} />
            <button
              type="submit"
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              Simulate authorization hold
            </button>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Demo only: this records a simulated hold. No PayPal request is
              made, and no money moves.
            </p>
          </form>
        ) : null}
      </section>

      {/* Agreement */}
      <section className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Agreement
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
          {deal.agreement}
        </p>
      </section>

      {/* Deal status controls */}
      {dealTransitions.length > 0 ? (
        <section className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Move this deal
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Only valid transitions are offered. Payment authorization is handled
            separately above.
          </p>
          <form
            action={changeDealStatusAction}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="dealId" value={deal.id} />
            <label htmlFor="deal-status" className="sr-only">
              New status
            </label>
            <select
              id="deal-status"
              name="status"
              defaultValue=""
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="" disabled>
                Choose status…
              </option>
              {dealTransitions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Update status
            </button>
          </form>
        </section>
      ) : null}

      {/* Milestones */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Milestones
        </h2>

        {deal.milestones.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            No milestones yet. Add the first one below.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {deal.milestones.map((milestone) => {
              const transitions = allowedMilestoneTransitions(
                milestone.status,
              );
              return (
                <li
                  key={milestone.id}
                  className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                        {milestone.title}
                      </h3>
                      {milestone.description ? (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                          {milestone.description}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge
                      label={milestone.status}
                      tone={milestoneStatusTone(milestone.status)}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      Amount{" "}
                      <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {formatCents(milestone.amountCents, deal.currency)}
                      </span>
                    </span>
                    <span>
                      Due{" "}
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {milestone.dueDate
                          ? formatDate(milestone.dueDate)
                          : "not set"}
                      </span>
                    </span>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Acceptance criteria
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                      {milestone.acceptanceCriteria}
                    </p>
                  </div>

                  <MilestoneEvidence deal={deal} milestone={milestone} />

                  {transitions.length > 0 ? (
                    <form
                      action={changeMilestoneStatusAction}
                      className="mt-4 flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="dealId" value={deal.id} />
                      <input
                        type="hidden"
                        name="milestoneId"
                        value={milestone.id}
                      />
                      <label
                        htmlFor={`ms-status-${milestone.id}`}
                        className="sr-only"
                      >
                        New milestone status
                      </label>
                      <select
                        id={`ms-status-${milestone.id}`}
                        name="status"
                        defaultValue=""
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="" disabled>
                          Change status…
                        </option>
                        {transitions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Update
                      </button>
                    </form>
                  ) : null}

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                      Edit milestone
                    </summary>
                    <EditMilestoneForm dealId={deal.id} milestone={milestone} />
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        {canAddMilestones ? (
          <div className="mt-4">
            <AddMilestoneForm dealId={deal.id} />
          </div>
        ) : null}
      </section>

      {/* Activity timeline */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Activity
        </h2>
        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            No activity yet.
          </p>
        ) : (
          <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
            {timeline.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

const RECOMMENDATION_TONES: Record<RecommendationAction, BadgeTone> = {
  CAPTURE: "success",
  HOLD: "warning",
  VOID: "neutral",
  DISPUTE: "danger",
};

const EVIDENCE_TONES: Record<EvidenceDecision, BadgeTone> = {
  pending: "info",
  accepted: "success",
  rejected: "danger",
};

function MilestoneEvidence({
  deal,
  milestone,
}: {
  deal: Deal;
  milestone: Milestone;
}) {
  const evidence = deal.evidence
    .filter((e) => e.milestoneId === milestone.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const recommendation = recommendMilestone({
    deal,
    milestone,
    evidence,
    now: new Date(),
  });
  const stale = milestone.approval
    ? approvalIsStale(milestone.approval, evidence)
    : false;
  const canSubmit =
    milestone.status !== "Completed" && milestone.status !== "Cancelled";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Evidence &amp; recommendation
          </h4>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {recommendation.explanation}
          </p>
        </div>
        <StatusBadge
          label={recommendation.action}
          tone={RECOMMENDATION_TONES[recommendation.action]}
        />
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {recommendation.reasonCodes.map((code) => (
          <li
            key={code}
            className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {code}
          </li>
        ))}
      </ul>

      {recommendation.requiresHumanReview ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          A human decision is required before any payment action. Code does not
          verify free-text acceptance criteria.
        </p>
      ) : null}

      <ApprovalPanel
        dealId={deal.id}
        milestoneId={milestone.id}
        recommendation={recommendation}
        approval={milestone.approval}
        stale={stale}
      />

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Evidence history ({evidence.length})
        </h4>
        {evidence.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            No evidence submitted yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {evidence.map((sub) => (
              <li
                key={sub.id}
                className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(sub.submittedAt)} · {sub.submittedBy}
                  </span>
                  <StatusBadge
                    label={sub.decision}
                    tone={EVIDENCE_TONES[sub.decision]}
                  />
                </div>
                {sub.note ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {sub.note}
                  </p>
                ) : null}
                {sub.url ? (
                  <p className="mt-1 truncate text-sm">
                    <a
                      href={sub.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-indigo-600 underline dark:text-indigo-400"
                    >
                      {sub.url}
                    </a>
                  </p>
                ) : null}
                {sub.file ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    File: {sub.file.name} ({sub.file.type},{" "}
                    {formatBytes(sub.file.size)})
                  </p>
                ) : null}
                {sub.reviewNote ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Review: {sub.reviewNote}
                  </p>
                ) : null}
                {sub.decision === "pending" && canSubmit ? (
                  <ReviewEvidenceForm dealId={deal.id} submissionId={sub.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canSubmit ? (
        <AddEvidenceForm dealId={deal.id} milestoneId={milestone.id} />
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TimelineItem({ event }: { event: DealEvent }) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600"
      />
      <p className="text-sm text-slate-800 dark:text-slate-200">
        {event.message}
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {formatDateTime(event.createdAt)} · {event.actor}
      </p>
    </li>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DealSkeleton() {
  return (
    <div className="mt-4 animate-pulse space-y-4" aria-hidden="true">
      <div className="h-48 rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}
