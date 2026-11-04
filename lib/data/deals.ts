/**
 * Deal + milestone data access.
 *
 * The only module that reads/writes deal state. Callers (server actions and
 * server components) must validate input before calling the mutating functions;
 * this layer additionally re-checks status transitions so rules cannot be
 * bypassed. Payment statuses are never accepted from callers.
 */
import { randomUUID } from "node:crypto";
import type {
  Deal,
  DealEvent,
  DealEventType,
  DealStatus,
  EvidenceDecision,
  EvidenceFile,
  EvidenceSubmission,
  Milestone,
  MilestoneApproval,
  MilestoneStatus,
} from "../domain/types.ts";
import { canTransitionDeal, canTransitionMilestone } from "../domain/status.ts";
import { readDatabase, withWriteLock, writeDatabase } from "./store.ts";
export { beginPaymentOperation, updatePaymentOperation } from "./payment-operations.ts";

export type MilestoneInput = Pick<
  Milestone,
  "title" | "description" | "amountCents" | "dueDate" | "acceptanceCriteria"
>;

export interface CreateDealInput {
  title: string;
  agreement: string;
  clientName: string;
  freelancerName: string;
  currency: string;
}

export type DealMutationResult =
  | { ok: true; deal: Deal }
  | { ok: false; error: string };

function now(): string {
  return new Date().toISOString();
}

function makeEvent(
  type: DealEventType,
  message: string,
  actor: string,
  milestoneId?: string,
): DealEvent {
  const event: DealEvent = { id: randomUUID(), type, message, actor, createdAt: now() };
  if (milestoneId) event.milestoneId = milestoneId;
  return event;
}

export async function listDeals(): Promise<Deal[]> {
  const db = await readDatabase();
  return [...db.deals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeal(id: string): Promise<Deal | null> {
  const db = await readDatabase();
  return db.deals.find((deal) => deal.id === id) ?? null;
}

export async function createDeal(
  input: CreateDealInput,
  actor = "system",
): Promise<Deal> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const timestamp = now();
    const deal: Deal = {
      id: randomUUID(),
      title: input.title,
      agreement: input.agreement,
      clientName: input.clientName,
      freelancerName: input.freelancerName,
      currency: input.currency,
      status: "Draft",
      authorization: null,
      pendingAuthorization: null,
      evidence: [],
      milestones: [],
      events: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    deal.events.push(
      makeEvent("deal.created", `Deal '${deal.title}' created.`, actor),
    );
    db.deals.push(deal);
    await writeDatabase(db);
    return deal;
  });
}

export async function addMilestone(
  dealId: string,
  input: MilestoneInput,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    const timestamp = now();
    const milestone: Milestone = {
      id: randomUUID(),
      ...input,
      status: "Draft",
      approval: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    deal.milestones.push(milestone);
    deal.updatedAt = timestamp;
    deal.events.push(
      makeEvent(
        "milestone.created",
        `Milestone '${milestone.title}' added.`,
        actor,
        milestone.id,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

export async function updateMilestone(
  dealId: string,
  milestoneId: string,
  input: MilestoneInput,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    const milestone = deal.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return { ok: false, error: "Milestone not found." };
    if (deal.authorization) {
      return {
        ok: false,
        error: "Milestones cannot be edited after an authorization exists.",
      };
    }
    if (deal.status === "Completed" || deal.status === "Disputed" || deal.status === "Cancelled") {
      return {
        ok: false,
        error: "Milestones cannot be edited while the deal is " + deal.status + ".",
      };
    }
    if (
      milestone.status === "Completed" ||
      milestone.status === "Disputed" ||
      milestone.status === "Cancelled"
    ) {
      return {
        ok: false,
        error: "Milestones cannot be edited while the milestone is " + milestone.status + ".",
      };
    }
    Object.assign(milestone, input, { updatedAt: now() });
    deal.updatedAt = now();
    deal.events.push(
      makeEvent(
        "milestone.updated",
        `Milestone '${milestone.title}' updated.`,
        actor,
        milestone.id,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

export async function setMilestoneStatus(
  dealId: string,
  milestoneId: string,
  to: MilestoneStatus,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    const milestone = deal.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return { ok: false, error: "Milestone not found." };
    if (milestone.status === to) {
      return { ok: true, deal };
    }
    if (!canTransitionMilestone(milestone.status, to)) {
      return {
        ok: false,
        error: `Cannot move milestone from '${milestone.status}' to '${to}'.`,
      };
    }
    const from = milestone.status;
    milestone.status = to;
    milestone.updatedAt = now();
    deal.updatedAt = now();
    deal.events.push(
      makeEvent(
        "milestone.status_changed",
        `Milestone '${milestone.title}' moved from '${from}' to '${to}'.`,
        actor,
        milestone.id,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

export async function setDealStatus(
  dealId: string,
  to: DealStatus,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    if (to === "Authorized") {
      return {
        ok: false,
        error: "Authorization must go through the payment adapter.",
      };
    }
    if (deal.status === to) return { ok: true, deal };
    if (!canTransitionDeal(deal.status, to)) {
      return {
        ok: false,
        error: `Cannot move deal from '${deal.status}' to '${to}'.`,
      };
    }
    const from = deal.status;
    deal.status = to;
    deal.updatedAt = now();
    deal.events.push(
      makeEvent(
        "deal.status_changed",
        `Deal moved from '${from}' to '${to}'.`,
        actor,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

/**
 * Records an authorization created by the payment adapter. Only the adapter
 * path may move a deal into `Authorized`; this function rejects any other
 * source state. The caller supplies the (already-obtained) adapter result.
 */
export async function markDealAuthorized(
  dealId: string,
  authorization: {
    providerName: string;
    providerReference: string | null;
    providerOrderId?: string | null;
    simulated: boolean;
    amountCents: number;
  },
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    if (deal.status !== "Ready for Authorization") {
      return {
        ok: false,
        error: "Deal is not ready for authorization.",
      };
    }
    deal.status = "Authorized";
    deal.authorization = {
      providerName: authorization.providerName,
      providerReference: authorization.providerReference,
      providerOrderId: authorization.providerOrderId ?? null,
      simulated: authorization.simulated,
      amountCents: authorization.amountCents,
      createdAt: now(),
    };
    deal.pendingAuthorization = null;
    deal.updatedAt = now();
    deal.events.push(
      makeEvent(
        authorization.simulated
          ? "deal.authorization_simulated"
          : "deal.authorization_sandbox",
        authorization.simulated
          ? `Authorization recorded via ${authorization.providerName} (SIMULATED — no PayPal request was made).`
          : `Authorization recorded via ${authorization.providerName} (PayPal sandbox). This is an authorization hold, not a capture.`,
        actor,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

/**
 * Records a provider order that was created but not yet authorized (the PayPal
 * sandbox buyer-approval step). Does not change deal status and moves no money.
 */
export async function setPendingAuthorization(
  dealId: string,
  pending: {
    providerName: string;
    mode: "demo" | "sandbox" | "live";
    providerOrderId: string;
    approvalUrl: string | null;
    amountCents: number;
    currency: string;
  },
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    if (deal.status !== "Ready for Authorization") {
      return { ok: false, error: "Deal is not ready for authorization." };
    }
    deal.pendingAuthorization = {
      providerName: pending.providerName,
      mode: pending.mode,
      providerOrderId: pending.providerOrderId,
      approvalUrl: pending.approvalUrl,
      amountCents: pending.amountCents,
      currency: pending.currency,
      createdAt: now(),
    };
    deal.updatedAt = now();
    deal.events.push(
      makeEvent(
        "deal.authorization_pending",
        `Authorization order created via ${pending.providerName}; waiting for buyer approval.`,
        actor,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

export interface EvidenceInput {
  note: string;
  url: string | null;
  file: EvidenceFile | null;
}

/**
 * Append an evidence submission to a milestone. The milestone must belong to
 * the deal, and terminal milestones reject new evidence.
 */
export async function addEvidence(
  dealId: string,
  milestoneId: string,
  input: EvidenceInput,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    const milestone = deal.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      return { ok: false, error: "Milestone not found in this deal." };
    }
    if (milestone.status === "Completed" || milestone.status === "Cancelled") {
      return {
        ok: false,
        error: `Cannot add evidence to a ${milestone.status.toLowerCase()} milestone.`,
      };
    }
    const timestamp = now();
    const submission: EvidenceSubmission = {
      id: randomUUID(),
      milestoneId,
      note: input.note,
      url: input.url,
      file: input.file,
      submittedAt: timestamp,
      submittedBy: actor,
      decision: "pending",
      reviewedAt: null,
      reviewNote: null,
    };
    deal.evidence.push(submission);
    deal.updatedAt = timestamp;
    const detail = [
      input.file ? `file '${input.file.name}'` : null,
      input.url ? "a link" : null,
      input.note ? "a note" : null,
    ]
      .filter(Boolean)
      .join(", ");
    deal.events.push(
      makeEvent(
        "evidence.submitted",
        `Evidence submitted for '${milestone.title}' (${detail}).`,
        actor,
        milestoneId,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

/** Record a human review decision on a pending submission (one-time only). */
export async function reviewEvidence(
  dealId: string,
  submissionId: string,
  decision: Exclude<EvidenceDecision, "pending">,
  reviewNote: string | null,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    const submission = deal.evidence.find((e) => e.id === submissionId);
    if (!submission) {
      return { ok: false, error: "Evidence submission not found." };
    }
    if (submission.decision !== "pending") {
      return { ok: false, error: "This submission has already been reviewed." };
    }
    const milestone = deal.milestones.find((m) => m.id === submission.milestoneId);
    const timestamp = now();
    submission.decision = decision;
    submission.reviewedAt = timestamp;
    submission.reviewNote = reviewNote;
    deal.updatedAt = timestamp;
    deal.events.push(
      makeEvent(
        "evidence.reviewed",
        `Evidence ${decision} for '${milestone?.title ?? "milestone"}'.`,
        actor,
        submission.milestoneId,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}

/**
 * Persist a human approval decision together with the recommendation it was
 * based on. The caller must have already validated the gating rules and run any
 * (simulated) payment operation; this function only records the outcome.
 */
export async function recordMilestoneApproval(
  dealId: string,
  milestoneId: string,
  approval: MilestoneApproval,
  actor = "system",
): Promise<DealMutationResult> {
  return withWriteLock(async () => {
    const db = await readDatabase();
    const deal = db.deals.find((d) => d.id === dealId);
    if (!deal) return { ok: false, error: "Deal not found." };
    const milestone = deal.milestones.find((m) => m.id === milestoneId);
    if (!milestone) {
      return { ok: false, error: "Milestone not found in this deal." };
    }
    // A recorded decision that already executed (or attempted) a payment can
    // never be overwritten. A non-terminal "reject / keep on hold" decision may
    // be revised later by a human.
    if (milestone.approval && milestone.approval.action !== "NONE") {
      return { ok: false, error: "This milestone has already been reviewed." };
    }
    const timestamp = now();
    milestone.approval = approval;
    milestone.updatedAt = timestamp;

    deal.events.push(
      makeEvent(
        "milestone.approval_recorded",
        `Reviewer decision for '${milestone.title}': ${approval.decision} → ${approval.action}` +
          `${approval.simulated && approval.action !== "NONE" ? " (SIMULATED — no PayPal request)" : ""}.`,
        actor,
        milestoneId,
      ),
    );

    if (
      approval.decision === "approve" &&
      approval.action === "CAPTURE" &&
      approval.paymentStatus === "COMPLETED" &&
      milestone.status !== "Completed"
    ) {
      const from = milestone.status;
      milestone.status = "Completed";
      deal.events.push(
        makeEvent(
          "milestone.status_changed",
          `Milestone '${milestone.title}' moved from '${from}' to 'Completed'.`,
          actor,
          milestoneId,
        ),
      );
    } else if (
      approval.action === "VOID" &&
      canTransitionMilestone(milestone.status, "Cancelled")
    ) {
      const from = milestone.status;
      milestone.status = "Cancelled";
      deal.events.push(
        makeEvent(
          "milestone.status_changed",
          `Milestone '${milestone.title}' moved from '${from}' to 'Cancelled'.`,
          actor,
          milestoneId,
        ),
      );
    }

    if (approval.action !== "NONE" && approval.providerReference) {
      deal.events.push(
        makeEvent(
          "milestone.payment_simulated",
          approval.simulated
            ? `Simulated ${approval.action} recorded via ${approval.providerName} (no PayPal request was made).`
            : `${approval.action} recorded via ${approval.providerName}.`,
          actor,
          milestoneId,
        ),
      );
    }

    deal.updatedAt = timestamp;
    await writeDatabase(db);
    return { ok: true, deal };
  });
}
