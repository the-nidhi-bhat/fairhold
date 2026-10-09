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
  Milestone,
  MilestoneStatus,
} from "../domain/types";
import { canTransitionDeal, canTransitionMilestone } from "../domain/status";
import { readDatabase, withWriteLock, writeDatabase } from "./store";

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
  authorization: { providerName: string; providerReference: string | null; simulated: boolean },
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
    deal.updatedAt = now();
    deal.events.push(
      makeEvent(
        "deal.authorization_simulated",
        authorization.simulated
          ? `Authorization recorded via ${authorization.providerName} (SIMULATED — no PayPal request was made).`
          : `Authorization recorded via ${authorization.providerName}.`,
        actor,
      ),
    );
    await writeDatabase(db);
    return { ok: true, deal };
  });
}
