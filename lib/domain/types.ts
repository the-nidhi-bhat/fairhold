/**
 * FairHold domain types.
 *
 * These are plain data types shared by the server and (for display only) the
 * UI. They contain no payment logic: amounts are stored as integer cents and
 * statuses are explicit string unions so that invalid values are rejected at
 * the type boundary rather than trusted from the client.
 */

export const DEAL_STATUSES = [
  "Draft",
  "Awaiting Agreement",
  "Ready for Authorization",
  "Authorized",
  "In Progress",
  "Awaiting Review",
  "Completed",
  "Disputed",
  "Cancelled",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const MILESTONE_STATUSES = [
  "Draft",
  "In Progress",
  "Awaiting Review",
  "Completed",
  "Disputed",
  "Cancelled",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** Amount in integer cents. Never a float, never client-authoritative. */
  amountCents: number;
  /** ISO calendar date (YYYY-MM-DD) or null when no deadline is set. */
  dueDate: string | null;
  acceptanceCriteria: string;
  status: MilestoneStatus;
  /**
   * The most recent human decision recorded for this milestone, or null.
   * Null until a reviewer explicitly approves or rejects a recommendation.
   */
  approval: MilestoneApproval | null;
  createdAt: string;
  updatedAt: string;
}

export type DealEventType =
  | "deal.created"
  | "deal.status_changed"
  | "deal.authorization_simulated"
  | "deal.authorization_sandbox"
  | "deal.authorization_pending"
  | "payment.authorization_confirmed"
  | "payment.authorization_voided"
  | "payment.capture_confirmed"
  | "milestone.created"
  | "milestone.updated"
  | "milestone.status_changed"
  | "evidence.submitted"
  | "evidence.reviewed"
  | "milestone.approval_recorded"
  | "milestone.payment_simulated";

export interface DealEvent {
  id: string;
  type: DealEventType;
  message: string;
  /** Signed demo identity that caused the event (`role:name`), or "system". */
  actor: string;
  createdAt: string;
  milestoneId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface Deal {
  id: string;
  title: string;
  agreement: string;
  clientName: string;
  freelancerName: string;
  /** ISO 4217 code. Only "USD" is supported in the current build. */
  currency: string;
  status: DealStatus;
  /** Record of the authorization hold, or null. */
  authorization: DealAuthorization | null;
  /**
   * A real (sandbox) order awaiting buyer approval, or null. Present only
   * between creating a PayPal order and authorizing it.
   */
  pendingAuthorization: PendingAuthorization | null;
  /** Append-only evidence submissions across all milestones of this deal. */
  evidence: EvidenceSubmission[];
  milestones: Milestone[];
  events: DealEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  version: number;
  deals: Deal[];
  paymentOperations?: PaymentOperation[];
}

export interface PaymentOperation {
  id: string;
  dealId: string;
  milestoneId: string | null;
  authorizationReference: string | null;
  action: "CAPTURE" | "VOID" | "AUTHORIZE";
  requestedAmountCents: number | null;
  currency: string | null;
  idempotencyKey: string;
  providerName: string;
  providerReference: string | null;
  status: "RESERVED" | "COMPLETED" | "VOIDED" | "PENDING" | "FAILED";
  finalCapture: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EVIDENCE_DECISIONS = ["pending", "accepted", "rejected"] as const;
export type EvidenceDecision = (typeof EVIDENCE_DECISIONS)[number];

export interface EvidenceFile {
  /** Display name after sanitization; never used as a filesystem path. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** Content type detected from the file's bytes, not from the client. */
  type: string;
  /** Path relative to the .data directory, e.g. "evidence/<id>.png". */
  storedPath: string;
}

export interface EvidenceSubmission {
  id: string;
  milestoneId: string;
  note: string;
  url: string | null;
  file: EvidenceFile | null;
  submittedAt: string;
  /** Actor recorded by the server from the signed session; never client-supplied. */
  submittedBy: string;
  decision: EvidenceDecision;
  reviewedAt: string | null;
  reviewNote: string | null;
}

// ---------------------------------------------------------------------------
// Deterministic recommendation
// ---------------------------------------------------------------------------

export const RECOMMENDATION_ACTIONS = [
  "CAPTURE",
  "HOLD",
  "VOID",
  "DISPUTE",
] as const;
export type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number];

export const REASON_CODES = [
  "EVIDENCE_MISSING",
  "EVIDENCE_PENDING_REVIEW",
  "EVIDENCE_ACCEPTED",
  "EVIDENCE_REJECTED",
  "EVIDENCE_NOT_MACHINE_CHECKABLE",
  "DEADLINE_PASSED",
  "DEADLINE_MET",
  "DEAL_NOT_AUTHORIZED",
  "DEAL_CANCELLED",
  "MILESTONE_CANCELLED",
  "MILESTONE_DISPUTED",
  "ALREADY_PROCESSED",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface Recommendation {
  action: RecommendationAction;
  reasonCodes: ReasonCode[];
  /** Human-readable explanation of why this action was recommended. */
  explanation: string;
  /** True whenever a human decision is required before any payment step. */
  requiresHumanReview: boolean;
  /** Number of evidence submissions considered (for the audit trail). */
  evidenceReviewedCount: number;
  /** Fingerprint of the reviewed evidence; a change makes an approval stale. */
  evidenceFingerprint: string;
}

// ---------------------------------------------------------------------------
// Human approval + payment authorization record
// ---------------------------------------------------------------------------

export const APPROVAL_DECISIONS = ["approve", "reject"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

/** The concrete action a reviewer's decision carried out (or "NONE"). */
export type ApprovalAction = "CAPTURE" | "VOID" | "NONE";

export interface MilestoneApproval {
  id: string;
  decision: ApprovalDecision;
  action: ApprovalAction;
  reasonCodes: ReasonCode[];
  explanation: string;
  evidenceFingerprint: string;
  evidenceReviewedCount: number;
  /** Actor recorded by the server from the signed session; never client-supplied. */
  reviewedBy: string;
  reviewedAt: string;
  /** Provider reference for a simulated/real payment operation, if any. */
  providerReference: string | null;
  providerName: string | null;
  simulated: boolean;
  /** Persisted provider outcome for the operation, when one was requested. */
  paymentStatus?: "COMPLETED" | "VOIDED" | "PENDING" | "FAILED";
  /** Optional human note recorded with the decision. */
  note: string | null;
}

export interface DealAuthorization {
  providerName: string;
  providerReference: string | null;
  /** Provider order id the authorization belongs to, when known. */
  providerOrderId?: string | null;
  simulated: boolean;
  amountCents: number;
  /**
   * ISO timestamp at which the provider says the hold expires, or null when the
   * provider did not report one. Never estimated: the UI only shows an expiry
   * the provider actually supplied.
   */
  expiresAt?: string | null;
  createdAt: string;
}

/**
 * A provider order that has been created but not yet authorized. For the PayPal
 * sandbox this is the step between creating the order and the buyer approving
 * it in PayPal. It is not an authorization and moves no money.
 */
export interface PendingAuthorization {
  providerName: string;
  mode: "demo" | "sandbox" | "live";
  providerOrderId: string;
  approvalUrl: string | null;
  amountCents: number;
  currency: string;
  createdAt: string;
}
