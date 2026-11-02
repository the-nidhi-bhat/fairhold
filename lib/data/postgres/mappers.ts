/**
 * Row → domain mapping. Loads full Deal trees (deal + milestones + approvals +
 * evidence + audit events + pending order + authorization) with a small fixed
 * set of queries, then assembles them in JavaScript.
 */
import type { PoolClient } from "pg";
import type {
  Deal,
  DealEvent,
  DealAuthorization,
  EvidenceSubmission,
  Milestone,
  MilestoneApproval,
  PendingAuthorization,
} from "../../domain/types.ts";

function ts(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function optTs(value: Date | string | null | undefined): string | undefined {
  return ts(value) ?? undefined;
}

function toNumber(value: string | number | bigint): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

/** Load deals (ordered by updated_at DESC) together with their full trees. */
export async function loadDealsBy(
  client: PoolClient,
  dealIds: readonly string[],
): Promise<Map<string, Deal>> {
  const byId = new Map<string, Deal>();
  if (dealIds.length === 0) return byId;

  const deals = await client.query(
    "SELECT * FROM deals WHERE id = ANY($1::uuid[]) ORDER BY updated_at DESC",
    [dealIds],
  );
  if ((deals.rowCount ?? 0) === 0) return byId;

  const ids = deals.rows.map((row) => row.id as string);

  const milestones = await client.query(
    `SELECT m.*,
            a.id                          AS approval_id,
            a.decision                    AS approval_decision,
            a.action                      AS approval_action,
            a.reason_codes                AS approval_reason_codes,
            a.explanation                 AS approval_explanation,
            a.evidence_fingerprint        AS approval_evidence_fingerprint,
            a.evidence_reviewed_count     AS approval_evidence_reviewed_count,
            a.reviewed_by                 AS approval_reviewed_by,
            a.reviewed_at                 AS approval_reviewed_at,
            a.provider_reference          AS approval_provider_reference,
            a.provider_name               AS approval_provider_name,
            a.simulated                   AS approval_simulated,
            a.payment_status              AS approval_payment_status,
            a.note                        AS approval_note
     FROM milestones m
     LEFT JOIN milestone_approvals a ON a.milestone_id = m.id
     WHERE m.deal_id = ANY($1::uuid[])`,
    [ids],
  );
  const evidence = await client.query(
    "SELECT * FROM evidence WHERE deal_id = ANY($1::uuid[]) ORDER BY submitted_at",
    [ids],
  );
  const events = await client.query(
    "SELECT * FROM audit_events WHERE deal_id = ANY($1::uuid[]) ORDER BY created_at",
    [ids],
  );
  const orders = await client.query(
    "SELECT * FROM payment_orders WHERE deal_id = ANY($1::uuid[])",
    [ids],
  );
  const authorizations = await client.query(
    "SELECT * FROM payment_authorizations WHERE deal_id = ANY($1::uuid[])",
    [ids],
  );

  // Group children by deal.
  const milestonesByDeal = new Map<string, typeof milestones.rows>();
  for (const row of milestones.rows) {
    const list = milestonesByDeal.get(row.deal_id as string) ?? [];
    list.push(row);
    milestonesByDeal.set(row.deal_id as string, list);
  }
  const evidenceByDeal = new Map<string, typeof evidence.rows>();
  for (const row of evidence.rows) {
    const list = evidenceByDeal.get(row.deal_id as string) ?? [];
    list.push(row);
    evidenceByDeal.set(row.deal_id as string, list);
  }
  const eventsByDeal = new Map<string, typeof events.rows>();
  for (const row of events.rows) {
    const list = eventsByDeal.get(row.deal_id as string) ?? [];
    list.push(row);
    eventsByDeal.set(row.deal_id as string, list);
  }
  const orderByDeal = new Map<string, (typeof orders.rows)[number]>();
  for (const row of orders.rows) orderByDeal.set(row.deal_id as string, row);
  const authByDeal = new Map<string, (typeof authorizations.rows)[number]>();
  for (const row of authorizations.rows)
    authByDeal.set(row.deal_id as string, row);

  for (const dealRow of deals.rows) {
    const dealId = dealRow.id as string;
    const milestoneRows = milestonesByDeal.get(dealId) ?? [];
    const evidenceRows = evidenceByDeal.get(dealId) ?? [];
    const eventRows = eventsByDeal.get(dealId) ?? [];
    const orderRow = orderByDeal.get(dealId);
    const authRow = authByDeal.get(dealId);

    const milestones: Milestone[] = milestoneRows.map((row) => {
      const approval: MilestoneApproval | null =
        row.approval_id === null || row.approval_id === undefined
          ? null
          : {
              id: row.approval_id as string,
              decision: row.approval_decision,
              action: row.approval_action,
              reasonCodes: row.approval_reason_codes as MilestoneApproval["reasonCodes"],
              explanation: row.approval_explanation,
              evidenceFingerprint: row.approval_evidence_fingerprint,
              evidenceReviewedCount: toNumber(row.approval_evidence_reviewed_count),
              reviewedBy: row.approval_reviewed_by,
              reviewedAt: ts(row.approval_reviewed_at) as string,
              providerReference: row.approval_provider_reference ?? null,
              providerName: row.approval_provider_name ?? null,
              simulated: row.approval_simulated as boolean,
              paymentStatus: row.approval_payment_status ?? undefined,
              note: row.approval_note ?? null,
            };
      return {
        id: row.id as string,
        title: row.title as string,
        description: row.description as string,
        amountCents: toNumber(row.amount_cents),
        dueDate: row.due_date === null ? null : (row.due_date as string),
        acceptanceCriteria: row.acceptance_criteria as string,
        status: row.status,
        approval,
        createdAt: ts(row.created_at) as string,
        updatedAt: ts(row.updated_at) as string,
      };
    });

    const evidenceList: EvidenceSubmission[] = evidenceRows.map((row) => ({
      id: row.id as string,
      milestoneId: row.milestone_id as string,
      note: row.note as string,
      url: row.url ?? null,
      file:
        row.file_stored_path !== null && row.file_stored_path !== undefined
          ? {
              name: row.file_name as string,
              size: toNumber(row.file_size),
              type: row.file_type as string,
              storedPath: row.file_stored_path as string,
            }
          : null,
      submittedAt: ts(row.submitted_at) as string,
      submittedBy: row.submitted_by as string,
      decision: row.decision,
      reviewedAt: optTs(row.reviewed_at) ?? null,
      reviewNote: row.review_note ?? null,
    }));

    const eventList: DealEvent[] = eventRows.map((row) => ({
      id: row.id as string,
      type: row.type as DealEvent["type"],
      message: row.message as string,
      actor: row.actor as string,
      createdAt: ts(row.created_at) as string,
      milestoneId:
        row.milestone_id === null ? undefined : (row.milestone_id as string),
      metadata:
        row.metadata === null || row.metadata === undefined
          ? undefined
          : (row.metadata as DealEvent["metadata"]),
    }));

    const pendingAuthorization: PendingAuthorization | null =
      orderRow === undefined
        ? null
        : {
            providerName: orderRow.provider_name as string,
            mode: orderRow.mode,
            providerOrderId: orderRow.provider_order_id as string,
            approvalUrl: orderRow.approval_url ?? null,
            amountCents: toNumber(orderRow.amount_cents),
            currency: orderRow.currency as string,
            createdAt: ts(orderRow.created_at) as string,
          };

    const authorization: DealAuthorization | null =
      authRow === undefined
        ? null
        : {
            providerName: authRow.provider_name as string,
            providerReference: authRow.provider_reference as string,
            providerOrderId: authRow.provider_order_id ?? null,
            simulated: authRow.simulated as boolean,
            amountCents: toNumber(authRow.amount_cents),
            createdAt: ts(authRow.created_at) as string,
          };

    byId.set(dealId, {
      id: dealId,
      title: dealRow.title as string,
      agreement: dealRow.agreement as string,
      clientName: dealRow.client_name as string,
      freelancerName: dealRow.freelancer_name as string,
      currency: dealRow.currency as string,
      status: dealRow.status,
      authorization,
      pendingAuthorization,
      evidence: evidenceList,
      milestones,
      events: eventList,
      createdAt: ts(dealRow.created_at) as string,
      updatedAt: ts(dealRow.updated_at) as string,
    });
  }

  return byId;
}