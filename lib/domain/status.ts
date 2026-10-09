/**
 * Deterministic status rules.
 *
 * "AI proposes. Rules decide." Everything in this module is a pure function
 * over plain data, so the state machine is auditable and unit-testable without
 * a database, a network, or an LLM. Transitions to the `Authorized` deal state
 * are intentionally excluded from manual transitions: that state may only be
 * entered through the payment provider adapter (demo, and later PayPal).
 */
import type { Deal, DealStatus, MilestoneStatus } from "./types";

const DEAL_TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  Draft: ["Awaiting Agreement", "Cancelled"],
  "Awaiting Agreement": ["Ready for Authorization", "Draft", "Cancelled"],
  "Ready for Authorization": ["Authorized", "Awaiting Agreement", "Cancelled"],
  Authorized: ["In Progress", "Disputed", "Cancelled"],
  "In Progress": ["Awaiting Review", "Disputed", "Cancelled"],
  "Awaiting Review": ["Completed", "In Progress", "Disputed"],
  Completed: ["Disputed"],
  Disputed: ["In Progress", "Cancelled"],
  Cancelled: [],
};

const MILESTONE_TRANSITIONS: Record<MilestoneStatus, readonly MilestoneStatus[]> = {
  Draft: ["In Progress", "Cancelled"],
  "In Progress": ["Awaiting Review", "Disputed", "Cancelled"],
  "Awaiting Review": ["Completed", "In Progress", "Disputed"],
  Completed: ["Disputed"],
  Disputed: ["In Progress", "Cancelled"],
  Cancelled: [],
};

export function allowedDealTransitions(from: DealStatus): readonly DealStatus[] {
  return DEAL_TRANSITIONS[from] ?? [];
}

/** Manual transitions exclude `Authorized`, which requires the payment adapter. */
export function allowedManualDealTransitions(from: DealStatus): DealStatus[] {
  return allowedDealTransitions(from).filter((s) => s !== "Authorized");
}

export function canTransitionDeal(from: DealStatus, to: DealStatus): boolean {
  return allowedDealTransitions(from).includes(to);
}

export function allowedMilestoneTransitions(
  from: MilestoneStatus,
): readonly MilestoneStatus[] {
  return MILESTONE_TRANSITIONS[from] ?? [];
}

export function canTransitionMilestone(
  from: MilestoneStatus,
  to: MilestoneStatus,
): boolean {
  return allowedMilestoneTransitions(from).includes(to);
}

export interface DealProgress {
  total: number;
  completed: number;
  percent: number;
  totalCents: number;
  completedCents: number;
}

export function computeProgress(
  deal: Pick<Deal, "milestones">,
): DealProgress {
  const total = deal.milestones.length;
  const completed = deal.milestones.filter(
    (m) => m.status === "Completed",
  ).length;
  const totalCents = deal.milestones.reduce((sum, m) => sum + m.amountCents, 0);
  const completedCents = deal.milestones
    .filter((m) => m.status === "Completed")
    .reduce((sum, m) => sum + m.amountCents, 0);
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent, totalCents, completedCents };
}

export type PaymentStatusKey =
  | "not_authorized"
  | "authorization_simulated"
  | "no_payment";

export interface PaymentStatusInfo {
  key: PaymentStatusKey;
  label: string;
  tone: "neutral" | "warning" | "success" | "danger";
  detail: string;
}

/**
 * Payment status is derived from the deal state. The only way a deal reaches
 * `Authorized` in this build is the demo adapter, so post-authorization states
 * are labelled as simulated and never presented as a real PayPal authorization.
 */
export function paymentStatusFor(deal: Pick<Deal, "status">): PaymentStatusInfo {
  switch (deal.status) {
    case "Draft":
    case "Awaiting Agreement":
    case "Ready for Authorization":
      return {
        key: "not_authorized",
        label: "Not authorized",
        tone: "neutral",
        detail: "No payment authorization has been requested.",
      };
    case "Cancelled":
      return {
        key: "no_payment",
        label: "No payment",
        tone: "neutral",
        detail: "The deal was cancelled before completion.",
      };
    case "Disputed":
      return {
        key: "authorization_simulated",
        label: "Authorization: simulated · Disputed",
        tone: "danger",
        detail:
          "Recorded by the demo payment adapter. No PayPal request was made.",
      };
    default:
      return {
        key: "authorization_simulated",
        label: "Authorization: simulated (demo)",
        tone: "warning",
        detail:
          "Recorded by the demo payment adapter. No PayPal request was made.",
      };
  }
}
