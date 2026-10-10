/**
 * PostgreSQL implementation of the deal/milestone data-access interface.
 *
 * Mirrors the JSON development store's function signatures (see ../deals.ts)
 * so callers cannot tell which backend they hit. Differences by design:
 *
 *   - Every multi-record mutation runs in one transaction (BEGIN/COMMIT/
 *     ROLLBACK) so a status change and its audit events, or an approval and
 *     its payment record, are never partially visible.
 *   - Every mutation locks the deal row with SELECT ... FOR UPDATE first,
 *     serializing concurrent transitions/financial operations per deal.
 *   - State-transition rules are re-checked inside the transaction against
 *     fresh (locked) state; unique constraints are the database-level backstop
 *     (one approval per milestone, one authorization per deal, one pending
 *     order per deal).
 *   - All queries are parameterized. No raw user input reaches SQL.
 *   - Errors returned to callers contain no driver/connection details.
 *
 * Audit events are append-only: no application code updates or deletes them.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canTransitionDeal, canTransitionMilestone } from "../../domain/status.ts";
import type {
  Deal,
  DealEventType,
  EvidenceDecision,
  Milestone,
} from "../../domain/types.ts";
import { isUniqueViolation, getPool, lockDeal, withTransaction } from "./client.ts";
import { loadDealsBy } from "./mappers.ts";

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

export interface EvidenceInput {
  note: string;
  url: string | null;
  file: {
    name: string;
    size: number;
    type: string;
    storedPath: string;
  } | null;
}

function now(): string {
  return new Date().toISOString();
}

async function insertEvent(
  client: PoolClient,
  dealId: string,
  type: DealEventType,
  message: string,
  actor: string,
  milestoneId?: string,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (id, deal_id, milestone_id, type, message, actor, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), dealId, milestoneId ?? null, type, message, actor, now()],
  );
}

async function touchDeal(client: PoolClient, dealId: string): Promise<void> {
  await client.query("UPDATE deals SET updated_at = $2 WHERE id = $1", [
    dealId,
    now(),
  ]);
}

async function loadDealOrNull(
  client: PoolClient,
  dealId: string,
): Promise<Deal | null> {
  return (await loadDealsBy(client, [dealId])).get(dealId) ?? null;
}

export async function listDeals(): Promise<Deal[]> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      "SELECT id FROM deals ORDER BY updated_at DESC",
    );
    const ids = rows.map((row) => row.id as string);
    const map = await loadDealsBy(client, ids);
    return ids
      .map((id) => map.get(id))
      .filter((deal): deal is Deal => deal !== undefined);
  } finally {
    client.release();
  }
}

export async function getDeal(id: string): Promise<Deal | null> {
  const client = await getPool().connect();
  try {
    return await loadDealOrNull(client, id);
  } finally {
    client.release();
  }
}

export async function createDeal(
  input: CreateDealInput,
  actor = "system",
): Promise<Deal> {
  return withTransaction(async (client) => {
    const id = randomUUID();
    const timestamp = now();
    await client.query(
      `INSERT INTO deals (id, title, agreement, client_name, freelancer_name, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Draft', $7, $7)`,
      [id, input.title, input.agreement, input.clientName, input.freelancerName, input.currency, timestamp],
    );
    await insertEvent(
      client,
      id,
      "deal.created",
      `Deal '${input.title}' created.`,
      actor,
    );
    const deal = await loadDealOrNull(client, id);
    if (!deal) throw new Error("deal row vanished after create");
    return deal;
  });
}

export async function addMilestone(
  dealId: string,
  input: MilestoneInput,
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const id = randomUUID();
    const timestamp = now();
    await client.query(
      `INSERT INTO milestones (id, deal_id, title, description, amount_cents, due_date, acceptance_criteria, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Draft', $8, $8)`,
      [id, dealId, input.title, input.description, input.amountCents, input.dueDate, input.acceptanceCriteria, timestamp],
    );
    await insertEvent(
      client,
      dealId,
      "milestone.created",
      `Milestone '${input.title}' added.`,
      actor,
      id,
    );
    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

export async function updateMilestone(
  dealId: string,
  milestoneId: string,
  input: MilestoneInput,
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const found = await client.query(
      "SELECT id FROM milestones WHERE id = $1 AND deal_id = $2",
      [milestoneId, dealId],
    );
    if ((found.rowCount ?? 0) === 0)
      return { ok: false, error: "Milestone not found." };
    await client.query(
      `UPDATE milestones SET title = $1, description = $2, amount_cents = $3,
              due_date = $4, acceptance_criteria = $5, updated_at = $6
       WHERE id = $7`,
      [input.title, input.description, input.amountCents, input.dueDate, input.acceptanceCriteria, now(), milestoneId],
    );
    await insertEvent(
      client,
      dealId,
      "milestone.updated",
      `Milestone '${input.title}' updated.`,
      actor,
      milestoneId,
    );
    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

export async function setMilestoneStatus(
  dealId: string,
  milestoneId: string,
  to: Milestone["status"],
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const found = await client.query(
      "SELECT title, status FROM milestones WHERE id = $1 AND deal_id = $2",
      [milestoneId, dealId],
    );
    if ((found.rowCount ?? 0) === 0)
      return { ok: false, error: "Milestone not found." };
    const title = found.rows[0].title as string;
    const from = found.rows[0].status as Milestone["status"];
    if (from === to) return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
    if (!canTransitionMilestone(from, to)) {
      return {
        ok: false,
        error: `Cannot move milestone from '${from}' to '${to}'.`,
      };
    }
    await client.query(
      "UPDATE milestones SET status = $1, updated_at = $2 WHERE id = $3",
      [to, now(), milestoneId],
    );
    await insertEvent(
      client,
      dealId,
      "milestone.status_changed",
      `Milestone '${title}' moved from '${from}' to '${to}'.`,
      actor,
      milestoneId,
    );
    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

export async function setDealStatus(
  dealId: string,
  to: Deal["status"],
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    if (to === "Authorized") {
      return {
        ok: false,
        error: "Authorization must go through the payment adapter.",
      };
    }
    const from = (
      await client.query("SELECT status FROM deals WHERE id = $1", [dealId])
    ).rows[0].status as Deal["status"];
    if (from === to) return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
    if (!canTransitionDeal(from, to)) {
      return {
        ok: false,
        error: `Cannot move deal from '${from}' to '${to}'.`,
      };
    }
    await client.query(
      "UPDATE deals SET status = $1, updated_at = $2 WHERE id = $3",
      [to, now(), dealId],
    );
    await insertEvent(
      client,
      dealId,
      "deal.status_changed",
      `Deal moved from '${from}' to '${to}'.`,
      actor,
    );
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

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
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const status = (
      await client.query("SELECT status FROM deals WHERE id = $1", [dealId])
    ).rows[0].status as Deal["status"];
    if (status !== "Ready for Authorization") {
      return { ok: false, error: "Deal is not ready for authorization." };
    }
    try {
      await client.query(
        `INSERT INTO payment_authorizations
           (id, deal_id, provider_name, provider_reference, provider_order_id, simulated, amount_cents, currency, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          dealId,
          authorization.providerName,
          authorization.providerReference,
          authorization.providerOrderId ?? null,
          authorization.simulated,
          authorization.amountCents,
          "USD",
          now(),
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, error: "Deal is already authorized." };
      }
      throw error;
    }
    await client.query("DELETE FROM payment_orders WHERE deal_id = $1", [dealId]);
    await client.query(
      "UPDATE deals SET status = 'Authorized', updated_at = $2 WHERE id = $1",
      [dealId, now()],
    );
    await insertEvent(
      client,
      dealId,
      authorization.simulated
        ? "deal.authorization_simulated"
        : "deal.authorization_sandbox",
      authorization.simulated
        ? `Authorization recorded via ${authorization.providerName} (SIMULATED — no PayPal request was made).`
        : `Authorization recorded via ${authorization.providerName} (PayPal sandbox). This is an authorization hold, not a capture.`,
      actor,
    );
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

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
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const status = (
      await client.query("SELECT status FROM deals WHERE id = $1", [dealId])
    ).rows[0].status as Deal["status"];
    if (status !== "Ready for Authorization") {
      return { ok: false, error: "Deal is not ready for authorization." };
    }
    await client.query(
      `INSERT INTO payment_orders
         (id, deal_id, provider_name, mode, provider_order_id, approval_url, amount_cents, currency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (deal_id) DO UPDATE SET
         provider_name = EXCLUDED.provider_name,
         mode = EXCLUDED.mode,
         provider_order_id = EXCLUDED.provider_order_id,
         approval_url = EXCLUDED.approval_url,
         amount_cents = EXCLUDED.amount_cents,
         currency = EXCLUDED.currency,
         created_at = EXCLUDED.created_at`,
      [
        randomUUID(),
        dealId,
        pending.providerName,
        pending.mode,
        pending.providerOrderId,
        pending.approvalUrl,
        pending.amountCents,
        pending.currency,
        now(),
      ],
    );
    await insertEvent(
      client,
      dealId,
      "deal.authorization_pending",
      `Authorization order created via ${pending.providerName}; waiting for buyer approval.`,
      actor,
    );
    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

export async function addEvidence(
  dealId: string,
  milestoneId: string,
  input: EvidenceInput,
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const found = await client.query(
      "SELECT status FROM milestones WHERE id = $1 AND deal_id = $2",
      [milestoneId, dealId],
    );
    if ((found.rowCount ?? 0) === 0)
      return { ok: false, error: "Milestone not found in this deal." };
    const status = found.rows[0].status as Milestone["status"];
    if (status === "Completed" || status === "Cancelled") {
      return {
        ok: false,
        error: `Cannot add evidence to a ${status.toLowerCase()} milestone.`,
      };
    }
    await client.query(
      `INSERT INTO evidence
         (id, deal_id, milestone_id, note, url, file_name, file_size, file_type, file_stored_path, submitted_by, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomUUID(),
        dealId,
        milestoneId,
        input.note,
        input.url,
        input.file?.name ?? null,
        input.file?.size ?? null,
        input.file?.type ?? null,
        input.file?.storedPath ?? null,
        actor,
        now(),
      ],
    );
    const detail = [
      input.file ? `file '${input.file.name}'` : null,
      input.url ? "a link" : null,
      input.note ? "a note" : null,
    ]
      .filter(Boolean)
      .join(", ");
    await insertEvent(
      client,
      dealId,
      "evidence.submitted",
      `Evidence submitted for milestone (${detail}).`,
      actor,
      milestoneId,
    );
    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

export async function reviewEvidence(
  dealId: string,
  submissionId: string,
  decision: Exclude<EvidenceDecision, "pending">,
  reviewNote: string | null,
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const found = await client.query(
      "SELECT id, decision, milestone_id FROM evidence WHERE id = $1 AND deal_id = $2",
      [submissionId, dealId],
    );
    if ((found.rowCount ?? 0) === 0) {
      return { ok: false, error: "Evidence submission not found." };
    }
    const row = found.rows[0];
    if (row.decision !== "pending") {
      return { ok: false, error: "This submission has already been reviewed." };
    }
    await client.query(
      `UPDATE evidence SET decision = $1, reviewed_at = $2, review_note = $3
       WHERE id = $4 AND deal_id = $5 AND decision = 'pending'`,
      [decision, now(), reviewNote, submissionId, dealId],
    );
    await insertEvent(
      client,
      dealId,
      "evidence.reviewed",
      `Evidence ${decision} for milestone.`,
      actor,
      row.milestone_id as string,
    );
    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}

export async function recordMilestoneApproval(
  dealId: string,
  milestoneId: string,
  approval: {
    id: string;
    decision: "approve" | "reject";
    action: "CAPTURE" | "VOID" | "NONE";
    reasonCodes: string[];
    explanation: string;
    evidenceFingerprint: string;
    evidenceReviewedCount: number;
    reviewedBy: string;
    reviewedAt: string;
    providerReference: string | null;
    providerName: string | null;
    simulated: boolean;
    note: string | null;
  },
  actor = "system",
): Promise<DealMutationResult> {
  return withTransaction(async (client) => {
    if (!(await lockDeal(client, dealId)))
      return { ok: false, error: "Deal not found." };
    const found = await client.query(
      "SELECT id, title, status FROM milestones WHERE id = $1 AND deal_id = $2",
      [milestoneId, dealId],
    );
    if ((found.rowCount ?? 0) === 0) {
      return { ok: false, error: "Milestone not found in this deal." };
    }
    const milestone = found.rows[0];
    const title = milestone.title as string;
    const status = milestone.status as Milestone["status"];

    try {
      await client.query(
        `INSERT INTO milestone_approvals
           (id, milestone_id, decision, action, reason_codes, explanation, evidence_fingerprint,
            evidence_reviewed_count, reviewed_by, reviewed_at, provider_reference, provider_name, simulated, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          approval.id,
          milestoneId,
          approval.decision,
          approval.action,
          JSON.stringify(approval.reasonCodes),
          approval.explanation,
          approval.evidenceFingerprint,
          approval.evidenceReviewedCount,
          approval.reviewedBy,
          approval.reviewedAt,
          approval.providerReference,
          approval.providerName,
          approval.simulated,
          approval.note,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, error: "This milestone has already been reviewed." };
      }
      throw error;
    }

    await insertEvent(
      client,
      dealId,
      "milestone.approval_recorded",
      `Reviewer decision for '${title}': ${approval.decision} → ${approval.action}` +
        `${approval.simulated && approval.action !== "NONE" ? " (SIMULATED — no PayPal request)" : ""}.`,
      actor,
      milestoneId,
    );

    if (
      approval.decision === "approve" &&
      approval.action === "CAPTURE" &&
      status !== "Completed"
    ) {
      await client.query(
        "UPDATE milestones SET status = 'Completed', updated_at = $2 WHERE id = $1",
        [milestoneId, now()],
      );
      await insertEvent(
        client,
        dealId,
        "milestone.status_changed",
        `Milestone '${title}' moved from '${status}' to 'Completed'.`,
        actor,
        milestoneId,
      );
    } else if (
      approval.action === "VOID" &&
      canTransitionMilestone(status, "Cancelled")
    ) {
      await client.query(
        "UPDATE milestones SET status = 'Cancelled', updated_at = $2 WHERE id = $1",
        [milestoneId, now()],
      );
      await insertEvent(
        client,
        dealId,
        "milestone.status_changed",
        `Milestone '${title}' moved from '${status}' to 'Cancelled'.`,
        actor,
        milestoneId,
      );
    }

    if (approval.action !== "NONE" && approval.providerReference) {
      await insertEvent(
        client,
        dealId,
        "milestone.payment_simulated",
        approval.simulated
          ? `Simulated ${approval.action} recorded via ${approval.providerName} (no PayPal request was made).`
          : `${approval.action} recorded via ${approval.providerName}.`,
        actor,
        milestoneId,
      );
    }

    await touchDeal(client, dealId);
    return { ok: true, deal: (await loadDealOrNull(client, dealId)) as Deal };
  });
}