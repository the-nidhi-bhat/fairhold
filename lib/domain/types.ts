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
  createdAt: string;
  updatedAt: string;
}

export type DealEventType =
  | "deal.created"
  | "deal.status_changed"
  | "deal.authorization_simulated"
  | "milestone.created"
  | "milestone.updated"
  | "milestone.status_changed";

export interface DealEvent {
  id: string;
  type: DealEventType;
  message: string;
  /** Who/what caused the event. "system" until authentication exists. */
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
  milestones: Milestone[];
  events: DealEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  version: number;
  deals: Deal[];
}
