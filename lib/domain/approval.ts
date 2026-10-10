/**
 * Human-approval gating — pure and deterministic.
 *
 * A recommendation never triggers a payment operation on its own. This module
 * decides, from the current recommendation and a reviewer's decision, whether
 * the decision is allowed and which concrete action (if any) it carries out.
 */
import type { ApprovalAction, ApprovalDecision, Recommendation } from "./types";

export const APPROVAL_ACTIONS: readonly ApprovalAction[] = [
  "CAPTURE",
  "VOID",
  "NONE",
];

export interface ApprovalPlan {
  allowed: boolean;
  action: ApprovalAction;
  error: string | null;
}

export function isApprovalDecision(value: unknown): value is ApprovalDecision {
  return value === "approve" || value === "reject";
}

/**
 * Approving is only allowed when the deterministic engine recommends CAPTURE
 * (release funds) or VOID (cancel the hold). Rejecting is always allowed and
 * never triggers a payment operation. Approving a HOLD or DISPUTE is refused.
 */
export function planApproval(
  recommendation: Recommendation,
  decision: ApprovalDecision,
): ApprovalPlan {
  if (decision === "reject") {
    return { allowed: true, action: "NONE", error: null };
  }
  if (recommendation.action === "CAPTURE") {
    return { allowed: true, action: "CAPTURE", error: null };
  }
  if (recommendation.action === "VOID") {
    return { allowed: true, action: "VOID", error: null };
  }
  return {
    allowed: false,
    action: "NONE",
    error:
      `A ${recommendation.action} recommendation cannot be approved directly. ` +
      "A human must resolve it first.",
  };
}
