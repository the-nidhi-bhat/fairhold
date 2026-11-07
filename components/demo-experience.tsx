"use client";

/**
 * Guided, browser-only FairHold demo.
 *
 * Why client-side: the public demo runs on a serverless host with a read-only
 * filesystem and no hosted database, so nothing can be persisted server-side
 * without paid infrastructure. This experience therefore keeps its state in
 * memory plus localStorage and says so, instead of pretending to save data.
 *
 * What it is NOT: a fake backend. It reuses the real deterministic rule engine
 * (`recommendMilestone`, `planApproval`, `summarizeDealMoney`) and never calls a
 * payment provider. Every payment step is labelled SIMULATED.
 */
import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { StatusBadge, dealStatusTone, milestoneStatusTone } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import { DEMO_IDENTITIES, DEMO_ROLES, type DemoRole } from "@/lib/demo/fixture";
import {
  createDemoState,
  demoMoney,
  demoReducer,
  type DemoAction,
  type DemoState,
} from "@/lib/demo/reducer";
import { formatCents } from "@/lib/domain/format";
import { parseAmountToCents } from "@/lib/domain/money";
import { recommendMilestone } from "@/lib/domain/rules";
import { computeProgress, paymentStatusFor } from "@/lib/domain/status";
import type { Recommendation } from "@/lib/domain/types";

const STORAGE_KEY = "fairhold.guided-demo.v1";
const DEMO_BANNER = "DEMO MODE — SIMULATED PAYMENTS";

type LocalAction = DemoAction | { type: "hydrate"; state: DemoState };

function reduce(state: DemoState, action: LocalAction): DemoState {
  if (action.type === "hydrate") return action.state;
  return demoReducer(state, action);
}

function isStoredState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoState>;
  return (
    candidate.version === 1 &&
    typeof candidate.role === "string" &&
    DEMO_ROLES.includes(candidate.role as DemoRole) &&
    !!candidate.deal &&
    Array.isArray(candidate.deal.milestones) &&
    Array.isArray(candidate.deal.evidence) &&
    Array.isArray(candidate.deal.events)
  );
}

function nextStep(state: DemoState): { title: string; body: string } {
  const { deal, role } = state;
  const pending = deal.evidence.filter((entry) => entry.decision === "pending").length;

  if (!deal.authorization) {
    return role === "buyer"
      ? {
          title: "Place the simulated authorization hold",
          body: "The buyer reserves the total milestone amount. This is a hold, never escrow, and no money moves.",
        }
      : {
          title: "Switch to Alex Buyer to place the hold",
          body: "Only the buyer can reserve funds. Use the role switcher above to view the same deal as the buyer.",
        };
  }

  if (pending > 0) {
    return role === "buyer"
      ? {
          title: `Review ${pending === 1 ? "the submitted evidence" : `${pending} submitted items`}`,
          body: "Accept the proof if it matches the written acceptance criteria, or request a specific change.",
        }
      : {
          title: "Waiting on the buyer's review",
          body: "Switch to Alex Buyer to accept the evidence or request changes.",
        };
  }

  const open = deal.milestones.filter(
    (milestone) => !milestone.approval && milestone.status !== "Completed",
  );
  if (open.length > 0) {
    return role === "buyer"
      ? {
          title: "Approve the milestone and record the simulated capture",
          body: "The rules engine allows approval only once evidence is accepted and the deadline is met. You remain the deciding human.",
        }
      : role === "seller"
        ? {
            title: "Submit evidence for the next milestone",
            body: "Add a note and a review link for each remaining milestone. The buyer decides.",
          }
        : {
            title: "Read the advisory panel",
            body: "A reviewer can read recommendations, but can never approve a milestone or move money.",
          };
  }

  return {
    title: "Every milestone is settled",
    body: "Reset the demo to run the lifecycle again from the opening scenario.",
  };
}

function recommendationsFor(
  deal: DemoState["deal"],
  now: Date,
): Map<string, Recommendation> {
  return new Map(
    deal.milestones.map((milestone) => [
      milestone.id,
      recommendMilestone({
        deal,
        milestone,
        evidence: deal.evidence.filter((entry) => entry.milestoneId === milestone.id),
        now,
      }),
    ]),
  );
}

export function DemoExperience() {
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    createDemoState(new Date(0)),
  );
  const [hydrated, setHydrated] = useState(false);
  const [evidenceDrafts, setEvidenceDrafts] = useState<
    Record<string, { note: string; url: string }>
  >({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [newMilestone, setNewMilestone] = useState({
    title: "",
    amount: "",
    criteria: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      dispatch({
        type: "hydrate",
        state: isStoredState(parsed) ? parsed : createDemoState(),
      });
    } catch {
      dispatch({ type: "hydrate", state: createDemoState() });
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode). The demo still works in memory.
    }
  }, [state, hydrated]);

  if (!hydrated) {
    return (
      <div className="page-frame py-16" aria-busy="true">
        <div className="surface p-8">
          <p className="section-label">Loading the guided demo…</p>
          <div className="mt-6 h-24 animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  const identity = DEMO_IDENTITIES[state.role];
  const money = demoMoney(state);
  const progress = computeProgress(state.deal);
  const payment = paymentStatusFor(state.deal);
  const step = nextStep(state);
  const completedSteps = [
    state.deal.authorization !== null,
    state.deal.evidence.some((entry) => entry.decision === "accepted"),
    state.deal.milestones.some((milestone) => milestone.approval !== null),
  ];
  const latestEventMessage =
    state.deal.events.at(-1)?.message ?? "The demo scenario is ready.";
  const recommendations = recommendationsFor(state.deal, new Date());

  function addMilestone() {
    const amount = parseAmountToCents(newMilestone.amount);
    if (!amount.ok) {
      setFormError(amount.error);
      return;
    }
    setFormError(null);
    dispatch({
      type: "add-milestone",
      title: newMilestone.title,
      amountCents: amount.value,
      acceptanceCriteria: newMilestone.criteria,
    });
    setNewMilestone({ title: "", amount: "", criteria: "" });
  }

  return (
    <>
      <div className="page-frame pt-6">
        <div
          role="note"
          className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[var(--background)]/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--accent)]">
              {DEMO_BANNER}
            </span>
            <p className="text-xs leading-5 text-[var(--foreground-soft)]">
              Browser-only simulation. No PayPal request is made, no money moves,
              and nothing leaves this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "reset" })}
            className="ghost-button shrink-0 px-3 text-xs"
          >
            Reset demo
          </button>
        </div>
      </div>

      <section className="page-frame pb-20 pt-10">
        <div className="flex flex-col gap-6 border-b border-[var(--hairline)] pb-8">
          <div className="max-w-3xl">
            <p className="eyebrow">Guided demo</p>
            <h1 className="headline mt-4 text-[clamp(2rem,4vw,3.1rem)]">
              Work moves forward. Payments move with proof.
            </h1>
            <p className="lede mt-4">
              Run the whole lifecycle yourself: place a hold, submit proof, review
              it, approve a milestone and watch the money summary update. The rules
              engine is the same one the server uses; only persistence and PayPal
              are simulated.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="secondary-button px-4 text-sm">
              Back to overview
            </Link>
            <Link href="/login" className="ghost-button px-3 text-sm">
              Open the signed-in workspace
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
          <div className="min-w-0 space-y-8">
            {/* Role switcher */}
            <fieldset className="surface p-5">
              <legend className="px-1 text-sm font-medium text-[var(--foreground-soft)]">
                View the deal as
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {DEMO_ROLES.map((role) => {
                  const person = DEMO_IDENTITIES[role];
                  const active = state.role === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={active}
                      onClick={() => dispatch({ type: "set-role", role })}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-[var(--foreground)]">
                        {person.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
                        {role}
                      </span>
                      <span className="mt-1.5 block text-xs leading-5 text-muted">
                        {person.responsibility}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-muted" role="status" aria-live="polite">
                Signed in as{" "}
                <strong className="font-semibold text-[var(--foreground-soft)]">
                  {identity.name}
                </strong>{" "}
                ({state.role}).{" "}
                <span className={state.lastError ? "text-[var(--warning)]" : undefined}>
                  {state.lastError ?? latestEventMessage}
                </span>
              </p>
            </fieldset>

            {/* Deal workspace */}
            <div className="deal-hero p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="section-label">Deal workspace</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                    {state.deal.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    {state.deal.clientName} (buyer) · {state.deal.freelancerName} (seller)
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <StatusBadge
                    label={state.deal.status}
                    tone={dealStatusTone(state.deal.status)}
                  />
                  <StatusBadge label={payment.label} tone={payment.tone} />
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {progress.completed} of {progress.total} milestones complete
                  </span>
                  <span className="tabular-nums">
                    {formatCents(progress.completedCents, state.deal.currency)} of{" "}
                    {formatCents(progress.totalCents, state.deal.currency)}
                  </span>
                </div>
                <div className="mt-2">
                  <ProgressBar percent={progress.percent} label="Milestone progress" />
                </div>
              </div>

              {money.hasAuthorization ? (
                <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-4">
                  {[
                    ["Authorized", money.authorizedCents],
                    ["Captured", money.capturedCents],
                    ["Pending", money.pendingCents],
                    ["Remaining", money.remainingCents],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="bg-[var(--surface-inset)] p-3.5">
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">
                        {formatCents(Number(value), state.deal.currency)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {!state.deal.authorization ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="primary-button px-4"
                    disabled={state.role !== "buyer"}
                    onClick={() => dispatch({ type: "authorize" })}
                  >
                    Place simulated hold
                  </button>
                  <span className="text-xs text-muted">
                    {state.role === "buyer"
                      ? `${formatCents(progress.totalCents, state.deal.currency)} reserved as a hold. Not a capture.`
                      : "Only the buyer can place the hold."}
                  </span>
                </div>
              ) : (
                <p className="mt-6 text-xs text-muted">
                  Authorization is a hold, not escrow. Funds are only marked captured
                  after a human approval and a provider confirmation.
                </p>
              )}
            </div>

            {/* Milestones */}
            <div>
              <div className="flex items-end justify-between gap-4">
                <h2 className="headline text-xl">Milestones</h2>
                <p className="text-xs text-muted">Evidence, review, approval, payment.</p>
              </div>

              <ol className="milestone-rail mt-5">
                {state.deal.milestones.map((milestone, index) => {
                  const evidence = state.deal.evidence.filter(
                    (entry) => entry.milestoneId === milestone.id,
                  );
                  const recommendation = recommendations.get(milestone.id);
                  const canApprove =
                    state.role === "buyer" &&
                    !milestone.approval &&
                    recommendation?.action === "CAPTURE";
                  return (
                    <li key={milestone.id} className="milestone-card p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                            Milestone {index + 1}
                          </p>
                          <h3 className="mt-1 text-base font-semibold tracking-[-0.02em]">
                            {milestone.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            label={milestone.status}
                            tone={milestoneStatusTone(milestone.status)}
                          />
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCents(milestone.amountCents, state.deal.currency)}
                          </span>
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
                            Acceptance criteria
                          </dt>
                          <dd className="mt-1 leading-5 text-[var(--foreground-soft)]">
                            {milestone.acceptanceCriteria}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">
                            Due
                          </dt>
                          <dd className="mt-1 text-[var(--foreground-soft)]">
                            {milestone.dueDate ?? "No deadline"}
                          </dd>
                        </div>
                      </dl>

                      {/* Evidence */}
                      <div className="mt-5">
                        <p className="section-label">Evidence</p>
                        {evidence.length === 0 ? (
                          <p className="mt-2 text-xs text-muted">
                            No evidence submitted yet.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-3">
                            {evidence.map((entry) => (
                              <li
                                key={entry.id}
                                className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-3.5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                    {entry.submittedBy}
                                  </span>
                                  <StatusBadge
                                    label={
                                      entry.decision === "pending"
                                        ? "Awaiting review"
                                        : entry.decision === "accepted"
                                          ? "Accepted"
                                          : "Changes requested"
                                    }
                                    tone={
                                      entry.decision === "pending"
                                        ? "warning"
                                        : entry.decision === "accepted"
                                          ? "success"
                                          : "danger"
                                    }
                                  />
                                </div>
                                <p className="mt-2 text-sm leading-6 text-[var(--foreground-soft)]">
                                  {entry.note}
                                </p>
                                {entry.url ? (
                                  <a
                                    href={entry.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 inline-block text-xs text-[var(--accent)] underline decoration-[var(--border-strong)] underline-offset-4"
                                  >
                                    Open submitted link
                                  </a>
                                ) : null}
                                {entry.reviewNote ? (
                                  <p className="mt-2 text-xs text-[var(--warning)]">
                                    Reviewer note: {entry.reviewNote}
                                  </p>
                                ) : null}

                                {state.role === "buyer" && entry.decision === "pending" ? (
                                  <div className="mt-3 border-t border-[var(--hairline)] pt-3">
                                    <label className="block text-xs font-medium text-[var(--foreground-soft)]">
                                      What needs to change? (required to request changes)
                                      <input
                                        className="field mt-1.5 text-sm"
                                        value={reviewNotes[entry.id] ?? ""}
                                        onChange={(event) =>
                                          setReviewNotes((current) => ({
                                            ...current,
                                            [entry.id]: event.target.value,
                                          }))
                                        }
                                        placeholder="e.g. Add the mobile navigation states"
                                      />
                                    </label>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="primary-button px-3 text-xs"
                                        onClick={() =>
                                          dispatch({
                                            type: "review-evidence",
                                            evidenceId: entry.id,
                                            decision: "accepted",
                                            note: reviewNotes[entry.id] ?? "",
                                          })
                                        }
                                      >
                                        Accept evidence
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary-button px-3 text-xs"
                                        onClick={() =>
                                          dispatch({
                                            type: "review-evidence",
                                            evidenceId: entry.id,
                                            decision: "rejected",
                                            note: reviewNotes[entry.id] ?? "",
                                          })
                                        }
                                      >
                                        Request changes
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Advisory */}
                      {recommendation ? (
                        <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface-raised)] p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                              Advisory · rules engine
                            </p>
                            <StatusBadge
                              label={recommendation.action}
                              tone={
                                recommendation.action === "CAPTURE"
                                  ? "success"
                                  : recommendation.action === "DISPUTE"
                                    ? "danger"
                                    : "warning"
                              }
                            />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted">
                            {recommendation.explanation}
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-muted/80">
                            {recommendation.reasonCodes.join(" · ")}
                          </p>
                          <p className="mt-2 text-[11px] text-muted">
                            Advisory only. No model is called in the guided demo, and
                            nothing here can approve, reject or capture by itself.
                          </p>
                        </div>
                      ) : null}

                      {/* Approval */}
                      {milestone.approval ? (
                        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-3.5">
                          <p className="text-xs font-semibold text-[var(--success)]">
                            Human decision recorded: {milestone.approval.decision} →{" "}
                            {milestone.approval.action}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {milestone.approval.reviewedBy} at{" "}
                            {milestone.approval.reviewedAt.slice(0, 16).replace("T", " ")} UTC
                            {". "}
                            {milestone.approval.simulated
                              ? "SIMULATED capture — no PayPal transaction exists for this step."
                              : "Provider-confirmed capture."}
                          </p>
                        </div>
                      ) : null}

                      {/* Role actions */}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {state.role === "buyer" ? (
                          <button
                            type="button"
                            className="primary-button px-3 text-xs"
                            disabled={!canApprove}
                            onClick={() =>
                              dispatch({
                                type: "approve-milestone",
                                milestoneId: milestone.id,
                                note: reviewNotes[milestone.id] ?? "",
                              })
                            }
                          >
                            Approve milestone
                          </button>
                        ) : null}
                        {!canApprove && state.role === "buyer" && !milestone.approval ? (
                          <span className="text-xs text-muted">
                            Approval unlocks after evidence is accepted and the
                            advisory returns CAPTURE.
                          </span>
                        ) : null}
                        {milestone.approval ? null : (
                          <span className="text-xs text-muted">
                            {state.role === "seller"
                              ? "Submit evidence below."
                              : state.role === "reviewer"
                                ? "Reviewers can read this deal but cannot act on it."
                                : null}
                          </span>
                        )}
                      </div>

                      {state.role === "seller" && milestone.status !== "Completed" ? (
                        <form
                          className="mt-4 space-y-2 border-t border-[var(--hairline)] pt-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const draft = evidenceDrafts[milestone.id] ?? {
                              note: "",
                              url: "",
                            };
                            dispatch({
                              type: "submit-evidence",
                              milestoneId: milestone.id,
                              note: draft.note,
                              url: draft.url,
                            });
                            setEvidenceDrafts((current) => ({
                              ...current,
                              [milestone.id]: { note: "", url: "" },
                            }));
                          }}
                        >
                          <label className="block text-xs font-medium text-[var(--foreground-soft)]">
                            Evidence note
                            <textarea
                              className="field mt-1.5 min-h-[72px] text-sm"
                              maxLength={1000}
                              value={(evidenceDrafts[milestone.id] ?? { note: "", url: "" }).note}
                              onChange={(event) =>
                                setEvidenceDrafts((current) => ({
                                  ...current,
                                  [milestone.id]: {
                                    note: event.target.value,
                                    url: current[milestone.id]?.url ?? "",
                                  },
                                }))
                              }
                              placeholder="What did you deliver, and where can the buyer check it?"
                            />
                          </label>
                          <label className="block text-xs font-medium text-[var(--foreground-soft)]">
                            Review link (optional)
                            <input
                              type="url"
                              className="field mt-1.5 text-sm"
                              value={(evidenceDrafts[milestone.id] ?? { note: "", url: "" }).url}
                              onChange={(event) =>
                                setEvidenceDrafts((current) => ({
                                  ...current,
                                  [milestone.id]: {
                                    note: current[milestone.id]?.note ?? "",
                                    url: event.target.value,
                                  },
                                }))
                              }
                              placeholder="https://"
                            />
                          </label>
                          <button type="submit" className="secondary-button px-3 text-xs">
                            Submit evidence
                          </button>
                          <p className="text-[11px] text-muted">
                            File uploads are disabled in the browser-only demo; the
                            signed-in workspace accepts validated files.
                          </p>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              {!state.deal.authorization && state.role !== "reviewer" ? (
                <div className="surface mt-5 p-5">
                  <h3 className="text-sm font-semibold">Add a milestone</h3>
                  <p className="mt-1 text-xs text-muted">
                    Milestones are frozen once the hold exists, so the agreement cannot
                    change under the buyer.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-[var(--foreground-soft)]">
                      Title
                      <input
                        className="field mt-1.5 text-sm"
                        value={newMilestone.title}
                        maxLength={120}
                        onChange={(event) =>
                          setNewMilestone((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-xs font-medium text-[var(--foreground-soft)]">
                      Amount (USD)
                      <input
                        className="field mt-1.5 text-sm"
                        inputMode="decimal"
                        value={newMilestone.amount}
                        onChange={(event) =>
                          setNewMilestone((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                        placeholder="750.00"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs font-medium text-[var(--foreground-soft)]">
                    Acceptance criteria
                    <textarea
                      className="field mt-1.5 min-h-[64px] text-sm"
                      value={newMilestone.criteria}
                      maxLength={1000}
                      onChange={(event) =>
                        setNewMilestone((current) => ({
                          ...current,
                          criteria: event.target.value,
                        }))
                      }
                      placeholder="What exactly must the seller show before a human can approve?"
                    />
                  </label>
                  {formError ? (
                    <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-button mt-3 px-3 text-xs"
                    onClick={addMilestone}
                  >
                    Add milestone
                  </button>
                </div>
              ) : null}
            </div>

            {/* Activity */}
            <div>
              <h2 className="headline text-xl">Activity trail</h2>
              <p className="mt-1 text-xs text-muted">
                Append-only in the real product. Here it lives in this browser only.
              </p>
              <ol className="activity-rail mt-4 space-y-3">
                {[...state.deal.events].reverse().map((entry) => (
                  <li key={entry.id} className="relative text-xs">
                    <p className="text-[var(--foreground-soft)]">{entry.message}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      {entry.actor} ·{" "}
                      <time dateTime={entry.createdAt}>
                        {entry.createdAt.slice(0, 16).replace("T", " ")} UTC
                      </time>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            <div className="surface p-5">
              <p className="section-label">Next step</p>
              <h2 className="mt-2 text-base font-semibold tracking-[-0.02em]">
                {step.title}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted">{step.body}</p>
              <ol className="mt-4 space-y-2 text-xs">
                {[
                  "Buyer places the simulated hold",
                  "Seller submits proof",
                  "Buyer reviews the evidence",
                  "Buyer approves → simulated capture",
                ].map((label, index) => (
                  <li key={label} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${
                        completedSteps[index]
                          ? "border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]"
                          : "border-[var(--border-strong)] text-muted"
                      }`}
                    >
                      {completedSteps[index] ? "✓" : index + 1}
                    </span>
                    <span className="text-muted">{label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="surface p-5">
              <p className="section-label">Payment state</p>
              <div className="mt-2">
                <StatusBadge label={payment.label} tone={payment.tone} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{payment.detail}</p>
            </div>

            <div className="surface p-5">
              <p className="section-label">What is simulated</p>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-muted">
                <li>• Payment authorization and capture (no PayPal request).</li>
                <li>• Persistence (localStorage, this device only).</li>
                <li>• File uploads (disabled in the guided demo).</li>
              </ul>
              <p className="mt-3 text-xs leading-5 text-muted">
                The recommendation engine, approval gating and money arithmetic are
                the real modules from the application.
              </p>
            </div>

            <div className="surface p-5">
              <p className="section-label">Prefer the real thing?</p>
              <p className="mt-2 text-xs leading-5 text-muted">
                The signed-in workspace uses the same workflow against PostgreSQL with
                signed sessions. It needs a configured database, which this public
                demo does not have.
              </p>
              <Link href="/login" className="secondary-button mt-3 px-3 text-xs">
                Open sign in
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

