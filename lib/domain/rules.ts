/**
 * Deterministic milestone recommendation engine.
 *
 * Pure functions only: given the stored deal, milestone and evidence, produce
 * an advisory recommendation (CAPTURE / HOLD / VOID / DISPUTE) with structured
 * reason codes and an explanation. This module NEVER moves money and NEVER
 * treats free-text criteria as machine-verified. A human must approve.
 */
import type {
  Deal,
  EvidenceSubmission,
  Milestone,
  MilestoneApproval,
  ReasonCode,
  Recommendation,
  RecommendationAction,
} from "./types";

/** Deal states in which a milestone could reasonably be paid out. A deal the buyer has disputed is never payable. */
const PAYABLE_DEAL_STATES = [
  "Authorized",
  "In Progress",
  "Awaiting Review",
] as const;

/**
 * Milestone states where the payout decision is already settled. A cancelled
 * milestone is deliberately NOT here: cancellation routes to a VOID
 * recommendation so the remaining hold can be released after human approval.
 */
const PROCESSED_MILESTONE_STATES = ["Completed"] as const;

/**
 * Stable fingerprint of the reviewed evidence. Order-independent; changes only
 * when submissions are added or their review decision changes, so it is safe
 * to use for staleness detection.
 */
export function evidenceFingerprint(
  evidence: readonly Pick<EvidenceSubmission, "id" | "submittedAt" | "decision">[],
): string {
  return evidence
    .map((e) => `${e.id}:${e.submittedAt}:${e.decision}`)
    .sort()
    .join("|");
}

/** True when the evidence changed after the approval was recorded. */
export function approvalIsStale(
  approval: MilestoneApproval | null,
  evidence: readonly Pick<EvidenceSubmission, "id" | "submittedAt" | "decision">[],
): boolean {
  if (!approval) return false;
  return approval.evidenceFingerprint !== evidenceFingerprint(evidence);
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

export interface RecommendInput {
  deal: Pick<Deal, "status">;
  milestone: Milestone;
  /** Evidence submissions belonging to this milestone (any order). */
  evidence: readonly EvidenceSubmission[];
  /** Injected for deterministic tests; callers pass new Date(). */
  now: Date;
}

export function recommendMilestone({
  deal,
  milestone,
  evidence,
  now,
}: RecommendInput): Recommendation {
  function build(
    action: RecommendationAction,
    reasonCodes: ReasonCode[],
    explanation: string,
  ): Recommendation {
    return {
      action,
      reasonCodes,
      explanation,
      requiresHumanReview: action !== "HOLD",
      evidenceReviewedCount: evidence.length,
      evidenceFingerprint: evidenceFingerprint(evidence),
    };
  }

  const approval = milestone.approval;
  const approvalExecuted =
    approval !== null &&
    approval.decision === "approve" &&
    (approval.action === "CAPTURE" || approval.action === "VOID") &&
    !approvalIsStale(approval, evidence);

  if (approvalExecuted) {
    return build(
      "HOLD",
      ["ALREADY_PROCESSED"],
      `A ${approval.action} decision was already recorded for this milestone; no further action is needed.`,
    );
  }

  if (
    PROCESSED_MILESTONE_STATES.includes(
      milestone.status as (typeof PROCESSED_MILESTONE_STATES)[number],
    )
  ) {
    return build(
      "HOLD",
      ["ALREADY_PROCESSED"],
      `This milestone is already "${milestone.status}"; there is nothing left to recommend.`,
    );
  }

  if (deal.status === "Cancelled") {
    return build(
      "VOID",
      ["DEAL_CANCELLED"],
      "The deal was cancelled. After human confirmation the remaining hold can be voided.",
    );
  }

  if (milestone.status === "Cancelled") {
    return build(
      "VOID",
      ["MILESTONE_CANCELLED"],
      "This milestone was cancelled. After human confirmation the remaining hold can be voided.",
    );
  }

  if (milestone.status === "Disputed") {
    return build(
      "DISPUTE",
      ["MILESTONE_DISPUTED"],
      "This milestone is disputed. Resolve the dispute before any payment decision.",
    );
  }

  // A rejection blocks payment until a *newer* submission is accepted, so the
  // required revision loop (reject → resubmit → accept) can still complete.
  const rejectedAt = evidence
    .filter((e) => e.decision === "rejected")
    .map((e) => e.submittedAt)
    .sort()
    .at(-1);
  const rejectionResolved =
    rejectedAt !== undefined &&
    evidence.some((e) => e.decision === "accepted" && e.submittedAt > rejectedAt);
  if (rejectedAt !== undefined && !rejectionResolved) {
    return build(
      "DISPUTE",
      ["EVIDENCE_REJECTED"],
      "A reviewer rejected submitted evidence for this milestone. Resolve the objection before any payment decision.",
    );
  }

  if (
    !PAYABLE_DEAL_STATES.includes(deal.status as (typeof PAYABLE_DEAL_STATES)[number])
  ) {
    return build(
      "HOLD",
      ["DEAL_NOT_AUTHORIZED"],
      "The deal is not authorized yet, so no payment decision is possible.",
    );
  }

  if (evidence.length === 0) {
    return build(
      "HOLD",
      ["EVIDENCE_MISSING"],
      "No evidence has been submitted for this milestone.",
    );
  }

  const hasAccepted = evidence.some((e) => e.decision === "accepted");
  if (!hasAccepted) {
    return build(
      "HOLD",
      ["EVIDENCE_PENDING_REVIEW"],
      "Submitted evidence has not been accepted yet; a human must review it.",
    );
  }

  if (milestone.dueDate && day(now.toISOString()) > milestone.dueDate) {
    return build(
      "HOLD",
      ["DEADLINE_PASSED"],
      `The deadline (${milestone.dueDate}) has passed. A human must decide whether that is acceptable.`,
    );
  }

  const reasons: ReasonCode[] = [
    "EVIDENCE_ACCEPTED",
    "EVIDENCE_NOT_MACHINE_CHECKABLE",
  ];
  if (milestone.dueDate) reasons.push("DEADLINE_MET");
  return build(
    "CAPTURE",
    reasons,
    "A reviewer accepted the submitted evidence and the deadline is met. " +
      "The written acceptance criteria are attested by that human review, not verified by code, " +
      "so a human must still approve the capture.",
  );
}
