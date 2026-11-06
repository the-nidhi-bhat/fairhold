import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { canAccessDeal, getDemoSession } from "@/lib/auth/session";
import {
  resolveEvidenceAdvisory,
  resolveMilestoneProposal,
} from "@/lib/ai/advisory";
import { getDeal } from "@/lib/data";
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
  confirmAuthorizationAction,
} from "../actions";
import { paymentRuntime } from "@/lib/payments/runtime";
import { AddMilestoneForm, EditMilestoneForm } from "./milestone-forms";
import {
  AddEvidenceForm,
  ApprovalPanel,
  ReviewEvidenceForm,
} from "./evidence-forms";

export const metadata = { title: "Deal" };
export const instant = false;

const ACTION_ERROR_MESSAGES: Record<string, string> = {
  role: "This action is not allowed for your current role. No changes were made.",
  forbidden: "You do not have access to this deal. No changes were made.",
  invalid_status:
    "That action is not available in the deal's current state. No changes were made.",
  invalid_transition:
    "That status change is not allowed from the current state. No changes were made.",
  not_found: "That record no longer exists. No changes were made.",
  no_milestones:
    "Add at least one milestone before requesting an authorization hold.",
  no_pending_authorization:
    "There is no pending PayPal authorization to confirm.",
  sandbox_unavailable:
    "Real PayPal confirmation requires PostgreSQL-backed payment accounting. No request was made.",
  provider:
    "The payment provider did not complete that request. Nothing was captured or voided.",
};

export default async function DealPage({
  params,
  searchParams,
}: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const errorCode =
    typeof query.actionError === "string" ? query.actionError : null;
  const actionError = errorCode
    ? (ACTION_ERROR_MESSAGES[errorCode] ??
      "That action could not be completed. No changes were made.")
    : null;

  // Resolve existence and access before streaming any markup: `notFound()`
  // thrown after the shell has flushed cannot replace the already-sent
  // response, which left a blank page with HTTP 200.
  const deal = await getDeal(id);
  if (!deal) notFound();
  const session = await getDemoSession();
  if (!session || !canAccessDeal(session, deal)) notFound();

  return (
    <div className="page-frame py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-[var(--accent)] hover:text-[var(--foreground)]"
      >
        &larr; Dashboard
      </Link>
      <Suspense fallback={<DealSkeleton />}>
        <DealDetail deal={deal} session={session} actionError={actionError} />
      </Suspense>
    </div>
  );
}

async function DealDetail({
  deal,
  session,
  actionError,
}: {
  deal: Deal;
  session: NonNullable<Awaited<ReturnType<typeof getDemoSession>>>;
  actionError: string | null;
}) {
  await connection();

  const progress = computeProgress(deal);
  const payment = paymentStatusFor(deal);
  const { provider, sandboxRequiresPostgres } = paymentRuntime();
  const sandboxConfigured = provider.mode === "sandbox";
  const canAuthorize = session.role === "buyer" || session.role === "reviewer";
  const dealTransitions = allowedManualDealTransitions(deal.status);
  const canAddMilestones =
    deal.status !== "Completed" &&
    deal.status !== "Disputed" &&
    deal.status !== "Cancelled" &&
    !deal.authorization &&
    !deal.pendingAuthorization;
  const canEditMilestone = (milestone: (typeof deal.milestones)[number]) =>
    canAddMilestones &&
    milestone.status !== "Completed" &&
    milestone.status !== "Disputed" &&
    milestone.status !== "Cancelled";
  const timeline = [...deal.events].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <>
      {actionError ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm text-[var(--warning)]"
        >
          {actionError}
        </div>
      ) : null}
      <header className="deal-hero mt-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="section-label">Deal workspace</p>
            <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold tracking-[-0.035em] text-[var(--foreground)]">
              {deal.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {deal.clientName} <span aria-hidden="true">&rarr;</span>{" "}
              {deal.freelancerName}
            </p>
          </div>
          <StatusBadge
            label={deal.status}
            tone={dealStatusTone(deal.status)}
          />
        </div>

        <div className="mt-7 flex items-center gap-3">
          <ProgressBar
            percent={progress.percent}
            label={`${deal.title} milestone progress`}
          />
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
            {progress.completed}/{progress.total} · {progress.percent}%
          </span>
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-4">
          <div className="bg-[var(--surface-inset)] p-3.5 sm:p-4">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Total
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--foreground)]">
              {formatCents(progress.totalCents, deal.currency)}
            </dd>
          </div>
          <div className="bg-[var(--surface-inset)] p-3.5 sm:p-4">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Completed
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--foreground)]">
              {formatCents(progress.completedCents, deal.currency)}
            </dd>
          </div>
          <div className="bg-[var(--surface-inset)] p-3.5 sm:p-4">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Created
            </dt>
            <dd className="mt-1 text-sm text-[var(--foreground-soft)]">
              {formatDate(deal.createdAt)}
            </dd>
          </div>
          <div className="bg-[var(--surface-inset)] p-3.5 sm:p-4">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
              Currency
            </dt>
            <dd className="mt-1 text-sm text-[var(--foreground-soft)]">
              {deal.currency}
            </dd>
          </div>
        </dl>
      </header>

      {/* Payment state — explicit and never overstated */}
      <section className="surface mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Payment
            </h2>
            <p className="mt-1 text-sm text-muted">
              {payment.detail}
            </p>
          </div>
          <StatusBadge label={payment.label} tone={payment.tone} />
        </div>

        {sandboxRequiresPostgres ? (
          <p className="mt-3 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset)] px-3 py-2 text-xs text-[var(--foreground-soft)]  dark:bg-[var(--surface-inset)] dark:text-[var(--foreground-soft)]">
            PayPal sandbox credentials are configured, but real payment actions
            require PostgreSQL-backed accounting. This session uses the simulated
            provider — no PayPal request is made and no money moves.
          </p>
        ) : null}

        {canAuthorize && deal.pendingAuthorization ? (
          <div className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-4 ">
            <p className="text-sm font-medium text-[var(--warning)]">
              Waiting for buyer approval in PayPal
            </p>
            <p className="mt-1 text-xs text-[var(--warning)]">
              A PayPal sandbox order was created via{" "}
              {deal.pendingAuthorization.providerName}. No authorization exists
              yet — approve the order in PayPal, then confirm below.
            </p>
            {deal.pendingAuthorization.approvalUrl ? (
              <a
                href={deal.pendingAuthorization.approvalUrl}
                target="_blank"
                rel="noreferrer"
                className="primary-button mt-3"
              >
                Open PayPal sandbox approval
              </a>
            ) : (
              <p className="mt-2 text-xs text-[var(--warning)]">
                PayPal did not return an approval URL; approve the order from the
                sandbox dashboard.
              </p>
            )}
            <form action={confirmAuthorizationAction} className="mt-3">
              <input type="hidden" name="dealId" value={deal.id} />
              <button
                type="submit"
                className="rounded-md border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] px-4 py-2 text-sm font-medium text-[var(--warning)] hover:bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]  "
              >
                I approved it — confirm authorization
              </button>
            </form>
          </div>
        ) : canAuthorize && deal.status === "Ready for Authorization" ? (
          <form action={authorizeDealAction} className="mt-4">
            <input type="hidden" name="dealId" value={deal.id} />
            <button
              type="submit"
              className="primary-button"
            >
              {sandboxConfigured
                ? "Create PayPal sandbox authorization"
                : "Simulate authorization hold"}
            </button>
            {sandboxConfigured ? (
              <p className="mt-2 text-xs text-[var(--warning)]">
                Creates a real order in the PayPal sandbox (no live money). The
                buyer must approve it, then confirm; this is an authorization
                hold, not a capture or settlement.
              </p>
            ) : (
              <p className="mt-2 text-xs text-[var(--warning)]">
                Demo only: this records a simulated hold. No PayPal request is
                made, and no money moves.
              </p>
            )}
          </form>
        ) : null}
      </section>

      <section className="surface mt-6 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Payment history
        </h2>
        {deal.milestones.some((milestone) => milestone.approval?.action !== undefined) ? (
          <div className="mt-4 divide-y divide-[var(--hairline)] ">
            {deal.milestones.filter((milestone) => milestone.approval).map((milestone) => {
              const approval = milestone.approval!;
              return (
                <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{milestone.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {approval.action} · {approval.paymentStatus ?? "No payment operation"}
                    </p>
                  </div>
                  <StatusBadge
                    label={approval.simulated ? "Simulated" : approval.providerName ?? "No provider"}
                    tone={approval.paymentStatus === "COMPLETED" || approval.paymentStatus === "VOIDED" ? "success" : "neutral"}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No payment operations recorded for this deal.</p>
        )}
      </section>

      {/* Agreement */}
      <section className="surface mt-6 p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Agreement
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-soft)]">
          {deal.agreement}
        </p>
      </section>

      {/* Deal status controls */}
      {dealTransitions.length > 0 &&
      (session.role === "seller" || session.role === "reviewer") ? (
        <section className="surface mt-6 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Move this deal
          </h2>
          <p className="mt-1 text-xs text-muted">
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
              className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-inset)] px-3 py-2 text-sm  "
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
              className="rounded-md border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-white/[0.06]  "
            >
              Update status
            </button>
          </form>
        </section>
      ) : null}

      {/* Milestones */}
      <section className="mt-6">
        {deal.milestones.length === 0 ? (
          <MilestoneAdvisory agreement={deal.agreement} />
        ) : null}
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Milestones
        </h2>

        {deal.milestones.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center text-sm text-muted  ">
            No milestones yet. Add the first one below.
          </p>
        ) : (
          <ul className="milestone-rail mt-5 space-y-4">
            {deal.milestones.map((milestone) => {
              const transitions = allowedMilestoneTransitions(
                milestone.status,
              );
              return (
                <li
                  key={milestone.id}
                  className="milestone-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">
                        {milestone.title}
                      </h3>
                      {milestone.description ? (
                        <p className="mt-1 text-sm text-muted">
                          {milestone.description}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge
                      label={milestone.status}
                      tone={milestoneStatusTone(milestone.status)}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                    <span>
                      Amount{" "}
                      <span className="font-medium tabular-nums text-[var(--foreground-soft)]">
                        {formatCents(milestone.amountCents, deal.currency)}
                      </span>
                    </span>
                    <span>
                      Due{" "}
                      <span className="font-medium text-[var(--foreground-soft)]">
                        {milestone.dueDate
                          ? formatDate(milestone.dueDate)
                          : "not set"}
                      </span>
                    </span>
                  </div>

                  <div className="surface-inset mt-3 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Acceptance criteria
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground-soft)]">
                      {milestone.acceptanceCriteria}
                    </p>
                  </div>

                  <EvidenceAdvisoryPanel
                    criteria={milestone.acceptanceCriteria}
                    evidence={deal.evidence
                      .filter((item) => item.milestoneId === milestone.id)
                      .map((item) =>
                        [item.note, item.url, item.file?.name]
                          .filter((value): value is string => Boolean(value))
                          .join(" "),
                      )}
                  />

                  <MilestoneEvidence
                    deal={deal}
                    milestone={milestone}
                    role={session.role}
                  />

                  {transitions.length > 0 &&
                  (session.role === "seller" || session.role === "reviewer") ? (
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
                        className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-inset)] px-3 py-1.5 text-sm  "
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
                        className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--foreground-soft)] hover:bg-white/[0.06]  "
                      >
                        Update
                      </button>
                    </form>
                  ) : null}

                  {(session.role === "seller" || session.role === "reviewer") &&
                  canEditMilestone(milestone) ? (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-[var(--foreground-soft)]">
                        Edit milestone
                      </summary>
                      <EditMilestoneForm dealId={deal.id} milestone={milestone} />
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canAddMilestones &&
        (session.role === "seller" || session.role === "reviewer") ? (
          <div className="mt-4">
            <AddMilestoneForm dealId={deal.id} />
          </div>
        ) : null}
      </section>

      {/* Activity timeline */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Activity
        </h2>
        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No activity yet.
          </p>
        ) : (
          <ol className="activity-rail mt-4 space-y-4">
            {timeline.map((event) => (
              <TimelineItem key={event.id} event={event} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

async function MilestoneAdvisory({ agreement }: { agreement: string }) {
  const { proposal, source } = await resolveMilestoneProposal(agreement);
  return (
    <section className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
        AI-shaped milestone advisory
      </p>
      <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">
        {proposal.title}
      </h3>
      <p className="mt-1 text-sm text-[var(--foreground-soft)]">
        {proposal.description}
      </p>
      <p className="mt-2 text-xs text-muted">
        Suggested acceptance criteria: {proposal.acceptanceCriteria}
      </p>
      <p className="mt-1 text-xs text-muted">
        Source: {source === "ai" ? "configured AI provider" : "deterministic fallback"}
      </p>
      <p className="mt-2 text-xs text-muted">
        Advisory only. A human creates milestones and deterministic rules decide
        payment.
      </p>
    </section>
  );
}

async function EvidenceAdvisoryPanel({
  criteria,
  evidence,
}: {
  criteria: string;
  evidence: string[];
}) {
  const { advisory, source } = await resolveEvidenceAdvisory(criteria, evidence);
  return (
    <div className="surface-inset mt-3 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Evidence advisory
      </p>
      <p className="mt-1 text-sm text-[var(--foreground-soft)]">
        {advisory.summary}
      </p>
      <p className="mt-1 text-xs text-muted">
        Source: {source === "ai" ? "configured AI provider" : "deterministic fallback"}
      </p>
      {advisory.concerns.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-[var(--warning)]">
          {advisory.concerns.map((concern) => (
            <li key={concern}>{concern}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-muted">
        Advisory only; it cannot approve evidence or execute payment.
      </p>
    </div>
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
  role,
}: {
  deal: Deal;
  milestone: Milestone;
  role: "buyer" | "seller" | "reviewer";
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
    <div className="surface-inset mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Evidence &amp; recommendation
          </h4>
          <p className="mt-1 text-sm text-[var(--foreground-soft)]">
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
            className="rounded border border-[var(--hairline)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-muted"
          >
            {code}
          </li>
        ))}
      </ul>

      {recommendation.requiresHumanReview ? (
        <p className="mt-2 text-xs text-muted">
          A human decision is required before any payment action. Code does not
          verify free-text acceptance criteria.
        </p>
      ) : null}

      {role === "buyer" || role === "reviewer" ? (
        <ApprovalPanel
          dealId={deal.id}
          milestoneId={milestone.id}
          recommendation={recommendation}
          approval={milestone.approval}
          stale={stale}
        />
      ) : (
        <p className="mt-3 text-xs text-muted">
          Final payment decisions are made by the buyer or an authorized reviewer.
        </p>
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Evidence history ({evidence.length})
        </h4>
        {evidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No evidence submitted yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {evidence.map((sub) => (
              <li
                key={sub.id}
                className="rounded-lg border border-[var(--hairline)] bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    {formatDateTime(sub.submittedAt)} · {sub.submittedBy}
                  </span>
                  <StatusBadge
                    label={sub.decision}
                    tone={EVIDENCE_TONES[sub.decision]}
                  />
                </div>
                {sub.note ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--foreground-soft)]">
                    {sub.note}
                  </p>
                ) : null}
                {sub.url ? (
                  <p className="mt-1 truncate text-sm">
                    <a
                      href={sub.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-[var(--accent)] underline underline-offset-2"
                    >
                      {sub.url}
                    </a>
                  </p>
                ) : null}
                {sub.file ? (
                  <p className="mt-1 text-xs text-muted">
                    File: {sub.file.name} ({sub.file.type},{" "}
                    {formatBytes(sub.file.size)})
                    {" "}
                    <a
                      href={`/api/evidence/${deal.id}/${sub.id}`}
                      className="font-medium text-[var(--accent)] underline underline-offset-2"
                    >
                      Download
                    </a>
                  </p>
                ) : null}
                {sub.reviewNote ? (
                  <p className="mt-1 text-xs text-muted">
                    Review: {sub.reviewNote}
                  </p>
                ) : null}
                {sub.decision === "pending" &&
                canSubmit &&
                (role === "buyer" || role === "reviewer") ? (
                  <ReviewEvidenceForm dealId={deal.id} submissionId={sub.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canSubmit && (role === "seller" || role === "reviewer") ? (
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
        className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full border border-[var(--accent)] bg-[var(--background)]"
      />
      <p className="text-sm text-[var(--foreground-soft)]">
        {event.message}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted">
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
      <div className="surface h-48" />
      <div className="surface h-24" />
      <div className="surface h-40" />
    </div>
  );
}
