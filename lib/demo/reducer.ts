/**
 * Guided demo state machine.
 *
 * Pure and deterministic: the same reducer runs in the browser and in the Node
 * test suite. It imports the SAME rule modules the server uses, so the demo
 * cannot drift into behaviour the real product would refuse:
 *
 *   - `recommendMilestone` decides whether a milestone may be paid.
 *   - `planApproval` decides whether a human approval is allowed.
 *   - `summarizeDealMoney` decides what the money summary may claim.
 *
 * Nothing here calls a payment provider. A simulated capture is labelled
 * `simulated: true` with a `demo-capture-*` reference so it can never be
 * mistaken for a PayPal transaction.
 */
import { planApproval } from "../domain/approval.ts";
import { validateEvidenceInput } from "../domain/evidence.ts";
import { summarizeDealMoney } from "../domain/money.ts";
import { recommendMilestone } from "../domain/rules.ts";
import type {
  Deal,
  DealEvent,
  DealEventType,
  EvidenceSubmission,
  MilestoneApproval,
} from "../domain/types.ts";
import { createDemoDeal, DEMO_IDENTITIES, type DemoRole } from "./fixture.ts";

export const DEMO_MAX_MILESTONE_CENTS = 100_000_000;

export interface DemoState {
  version: 1;
  deal: Deal;
  role: DemoRole;
  /** Last refused action, surfaced inline. Cleared by the next valid action. */
  lastError: string | null;
  /** Increments on every applied change so the UI can announce it. */
  revision: number;
}

export type DemoAction =
  | { type: "set-role"; role: DemoRole }
  | { type: "authorize" }
  | { type: "submit-evidence"; milestoneId: string; note: string; url: string }
  | {
      type: "review-evidence";
      evidenceId: string;
      decision: "accepted" | "rejected";
      note: string;
    }
  | { type: "approve-milestone"; milestoneId: string; note: string }
  | {
      type: "add-milestone";
      title: string;
      amountCents: number;
      acceptanceCriteria: string;
    }
  | { type: "dismiss-error" }
  | { type: "reset" };

export function createDemoState(now: Date = new Date()): DemoState {
  return {
    version: 1,
    deal: createDemoDeal(now),
    role: "buyer",
    lastError: null,
    revision: 0,
  };
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function event(
  type: DealEventType,
  message: string,
  actor: string,
  now: Date,
  milestoneId?: string,
): DealEvent {
  return {
    id: newId(),
    type,
    message,
    actor,
    createdAt: now.toISOString(),
    ...(milestoneId ? { milestoneId } : {}),
  };
}

function actorFor(state: DemoState): string {
  return DEMO_IDENTITIES[state.role].actor;
}

function refuse(state: DemoState, message: string): DemoState {
  return { ...state, lastError: message };
}

function accepted(state: DemoState, deal: Deal, now: Date): DemoState {
  return {
    ...state,
    deal: { ...deal, updatedAt: now.toISOString() },
    lastError: null,
    revision: state.revision + 1,
  };
}

function evidenceFor(deal: Deal, milestoneId: string): EvidenceSubmission[] {
  return deal.evidence.filter((entry) => entry.milestoneId === milestoneId);
}

/** Milestone status derived from its evidence, so the rail never lies. */
function statusFromEvidence(
  current: Deal["milestones"][number]["status"],
  evidence: readonly EvidenceSubmission[],
): Deal["milestones"][number]["status"] {
  if (current === "Completed" || current === "Cancelled") return current;
  if (evidence.length === 0) return "In Progress";
  const latest = [...evidence].sort((a, b) =>
    a.submittedAt.localeCompare(b.submittedAt),
  ).at(-1);
  if (latest?.decision === "accepted") return "Awaiting Review";
  if (latest?.decision === "rejected") return "In Progress";
  return "Awaiting Review";
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  const now = new Date();

  switch (action.type) {
    case "reset":
      return createDemoState(now);

    case "dismiss-error":
      return { ...state, lastError: null };

    case "set-role":
      return { ...state, role: action.role, lastError: null };

    case "authorize": {
      if (state.role !== "buyer") {
        return refuse(state, "Only the buyer can place the authorization hold.");
      }
      if (state.deal.authorization) {
        return refuse(state, "This deal already has an authorization hold.");
      }
      if (state.deal.status !== "Ready for Authorization") {
        return refuse(
          state,
          `A hold can only be placed while the deal is "Ready for Authorization" (it is "${state.deal.status}").`,
        );
      }
      const total = state.deal.milestones.reduce(
        (sum, milestone) => sum + milestone.amountCents,
        0,
      );
      if (total <= 0) {
        return refuse(state, "Add at least one milestone before authorizing a hold.");
      }

      const deal: Deal = {
        ...state.deal,
        status: "Authorized",
        authorization: {
          providerName: "demo-payment-provider",
          providerReference: `demo-auth-${newId()}`,
          simulated: true,
          amountCents: total,
          createdAt: now.toISOString(),
        },
        events: [
          ...state.deal.events,
          event(
            "deal.authorization_simulated",
            `SIMULATED hold placed for ${(total / 100).toFixed(2)} USD. No PayPal request was made.`,
            actorFor(state),
            now,
          ),
        ],
      };
      return accepted(state, deal, now);
    }

    case "add-milestone": {
      if (state.role !== "seller" && state.role !== "buyer") {
        return refuse(state, "Only the buyer or seller can add a milestone.");
      }
      if (state.deal.authorization) {
        return refuse(
          state,
          "Milestones are fixed once the hold is authorized. Complete this one or void the hold.",
        );
      }
      const title = action.title.trim();
      if (title.length < 3) {
        return refuse(state, "Give the milestone a title of at least 3 characters.");
      }
      if (!Number.isSafeInteger(action.amountCents) || action.amountCents <= 0) {
        return refuse(state, "Enter a positive amount in whole cents.");
      }
      if (action.amountCents > DEMO_MAX_MILESTONE_CENTS) {
        return refuse(state, "That amount is above the demo limit of 1,000,000.00 USD.");
      }
      const criteria = action.acceptanceCriteria.trim();
      if (criteria.length < 10) {
        return refuse(
          state,
          "Write acceptance criteria of at least 10 characters so a human can judge the proof.",
        );
      }

      const deal: Deal = {
        ...state.deal,
        milestones: [
          ...state.deal.milestones,
          {
            id: newId(),
            title,
            description: "",
            amountCents: action.amountCents,
            dueDate: null,
            acceptanceCriteria: criteria,
            status: "Draft",
            approval: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        events: [
          ...state.deal.events,
          event(
            "milestone.created",
            `Milestone added: ${title}.`,
            actorFor(state),
            now,
          ),
        ],
      };
      return accepted(state, deal, now);
    }

    case "submit-evidence": {
      if (state.role !== "seller") {
        return refuse(state, "Only the seller can submit evidence.");
      }
      const milestone = state.deal.milestones.find(
        (entry) => entry.id === action.milestoneId,
      );
      if (!milestone) return refuse(state, "That milestone no longer exists.");
      if (milestone.status === "Completed") {
        return refuse(state, "This milestone is already completed and paid.");
      }

      const result = validateEvidenceInput({
        note: action.note,
        url: action.url,
        file: null,
      });
      if (!result.ok) {
        return refuse(
          state,
          "Evidence needs a note of up to 1000 characters or a valid http(s) link.",
        );
      }

      const submission: EvidenceSubmission = {
        id: newId(),
        milestoneId: milestone.id,
        note: result.value.note,
        url: result.value.url,
        file: null,
        submittedAt: now.toISOString(),
        submittedBy: actorFor(state),
        decision: "pending",
        reviewedAt: null,
        reviewNote: null,
      };
      const evidence = [...state.deal.evidence, submission];

      const deal: Deal = {
        ...state.deal,
        status: "Awaiting Review",
        evidence,
        milestones: state.deal.milestones.map((entry) =>
          entry.id === milestone.id
            ? {
                ...entry,
                status: statusFromEvidence(entry.status, evidenceFor({ ...state.deal, evidence }, entry.id)),
                updatedAt: now.toISOString(),
              }
            : entry,
        ),
        events: [
          ...state.deal.events,
          event(
            "evidence.submitted",
            `Evidence submitted for ${milestone.title}.`,
            actorFor(state),
            now,
            milestone.id,
          ),
        ],
      };
      return accepted(state, deal, now);
    }

    case "review-evidence": {
      if (state.role !== "buyer") {
        return refuse(state, "Only the buyer can review evidence for this deal.");
      }
      const submission = state.deal.evidence.find(
        (entry) => entry.id === action.evidenceId,
      );
      if (!submission) return refuse(state, "That evidence no longer exists.");
      if (submission.decision !== "pending") {
        return refuse(state, "That submission has already been reviewed.");
      }
      const note = action.note.trim().slice(0, 1000);
      if (action.decision === "rejected" && note.length < 5) {
        return refuse(
          state,
          "Explain what needs to change so the seller can fix it.",
        );
      }

      const evidence = state.deal.evidence.map((entry) =>
        entry.id === submission.id
          ? {
              ...entry,
              decision: action.decision,
              reviewedAt: now.toISOString(),
              reviewNote: note || null,
            }
          : entry,
      );
      const milestone = state.deal.milestones.find(
        (entry) => entry.id === submission.milestoneId,
      );

      const deal: Deal = {
        ...state.deal,
        evidence,
        milestones: state.deal.milestones.map((entry) =>
          entry.id === submission.milestoneId
            ? {
                ...entry,
                status: statusFromEvidence(
                  entry.status,
                  evidence.filter((item) => item.milestoneId === entry.id),
                ),
                updatedAt: now.toISOString(),
              }
            : entry,
        ),
        events: [
          ...state.deal.events,
          event(
            "evidence.reviewed",
            action.decision === "accepted"
              ? `Evidence accepted for ${milestone?.title ?? "the milestone"}.`
              : `Changes requested for ${milestone?.title ?? "the milestone"}: ${note}`,
            actorFor(state),
            now,
            submission.milestoneId,
          ),
        ],
      };
      return accepted(state, deal, now);
    }

    case "approve-milestone": {
      if (state.role !== "buyer") {
        return refuse(state, "Only the buyer can approve a milestone.");
      }
      const milestone = state.deal.milestones.find(
        (entry) => entry.id === action.milestoneId,
      );
      if (!milestone) return refuse(state, "That milestone no longer exists.");
      if (milestone.approval) {
        return refuse(state, "A decision is already recorded for this milestone.");
      }

      const evidence = evidenceFor(state.deal, milestone.id);
      const recommendation = recommendMilestone({
        deal: state.deal,
        milestone,
        evidence,
        now,
      });
      const plan = planApproval(recommendation, "approve");
      if (!plan.allowed) {
        return refuse(state, plan.error ?? "That decision is not allowed yet.");
      }

      const simulated = plan.action === "CAPTURE";
      const approval: MilestoneApproval = {
        id: newId(),
        decision: "approve",
        action: plan.action,
        reasonCodes: recommendation.reasonCodes,
        explanation: recommendation.explanation,
        evidenceFingerprint: recommendation.evidenceFingerprint,
        evidenceReviewedCount: recommendation.evidenceReviewedCount,
        reviewedBy: actorFor(state),
        reviewedAt: now.toISOString(),
        providerReference: simulated ? `demo-capture-${newId()}` : null,
        providerName: "demo-payment-provider",
        simulated,
        paymentStatus: plan.action === "CAPTURE" ? "COMPLETED" : "VOIDED",
        note: action.note.trim().slice(0, 1000) || null,
      };

      const milestones = state.deal.milestones.map((entry) =>
        entry.id === milestone.id
          ? {
              ...entry,
              status: plan.action === "CAPTURE" ? ("Completed" as const) : entry.status,
              approval,
              updatedAt: now.toISOString(),
            }
          : entry,
      );
      const allCompleted = milestones.every(
        (entry) => entry.status === "Completed" || entry.status === "Cancelled",
      );

      const deal: Deal = {
        ...state.deal,
        status: allCompleted ? "Completed" : "In Progress",
        milestones,
        events: [
          ...state.deal.events,
          event(
            "milestone.approval_recorded",
            `Human approval recorded for ${milestone.title} (${plan.action}).`,
            actorFor(state),
            now,
            milestone.id,
          ),
          ...(simulated
            ? [
                event(
                  "milestone.payment_simulated",
                  `SIMULATED capture of ${(milestone.amountCents / 100).toFixed(2)} USD recorded for ${milestone.title}. No PayPal request was made.`,
                  actorFor(state),
                  now,
                  milestone.id,
                ),
              ]
            : []),
        ],
      };
      return accepted(state, deal, now);
    }

    default:
      return state;
  }
}

/** Money figures for the current demo deal, computed by the shared rules. */
export function demoMoney(state: DemoState) {
  return summarizeDealMoney(state.deal);
}
