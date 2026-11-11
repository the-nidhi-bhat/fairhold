/**
 * Durable, idempotent PayPal webhook reconciliation (Phase 5).
 *
 * Contract with the HTTP endpoint (app/api/paypal/webhook/route.ts):
 *
 *   - The endpoint verifies the provider signature BEFORE calling into this
 *     module; this module never trusts event contents on its own.
 *   - processWebhookEvent() runs ONE transaction per delivery:
 *       1. INSERT the event into webhook_events (provider, event_id) with
 *          ON CONFLICT DO NOTHING — the unique constraint is the idempotency
 *          backstop.
 *       2. CLAIM the row: received|failed -> processing (attempts+1). Zero rows
 *          claimed means a duplicate delivery (already processed, or claimed by
 *          a concurrent delivery) — commit and no-op.
 *       3. Reconcile against authoritative state (deals / payment_orders /
 *          payment_authorizations / milestone_approvals) in the SAME
 *          transaction, with FOR UPDATE guards on the deal row.
 *       4. Mark the row processed, or failed with a sanitized quarantine
 *          reason. A quarantine is COMMITTED and returned as a 2xx to the
 *          provider: the event will not be auto-retried, and operations must
 *          inspect the webhook inbox. A database/protocol failure instead
 *          ROLLS BACK the whole transaction (no row persisted) and rethrows,
 *          so the endpoint returns 5xx and the provider redelivers.
 *
 * Provider events are PAYMENT-LIFECYCLE EVIDENCE, never permission: nothing
 * here can approve a human decision or trigger a capture. capture_completed
 * only ever records evidence for an approval a human already recorded, and the
 * milestone moves to Completed only through that approval's capture path.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { mapWebhookEvent } from "../../payments/paypal.ts";
import { isUniqueViolation, lockDeal, withTransaction } from "./client.ts";

/** Provider identity used for every webhook inbox row and reconciliation match. */
export const PAYPAL_WEBHOOK_PROVIDER = "paypal-sandbox";

export type WebhookProcessOutcome =
  | { outcome: "processed" }
  | { outcome: "duplicate" }
  | { outcome: "unsupported"; reason: string }
  | { outcome: "quarantined"; reason: string };

function now(): string {
  return new Date().toISOString();
}

async function insertAudit(
  client: PoolClient,
  dealId: string | null,
  type: string,
  message: string,
  milestoneId: string | null | undefined = undefined,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (id, deal_id, milestone_id, type, message, actor, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), dealId, milestoneId ?? null, type, message, "system", now()],
  );
}

async function markProcessed(
  client: PoolClient,
  eventId: string,
  lastError: string | null,
): Promise<void> {
  await client.query(
    `UPDATE webhook_events
     SET status = 'processed', processed_at = $3, last_error = $2
     WHERE provider = $1 AND event_id = $4 AND status = 'processing'`,
    [PAYPAL_WEBHOOK_PROVIDER, lastError, now(), eventId],
  );
}

async function markQuarantined(
  client: PoolClient,
  eventId: string,
  reason: string,
): Promise<void> {
  await client.query(
    `UPDATE webhook_events
     SET status = 'failed', last_error = $3
     WHERE provider = $1 AND event_id = $2 AND status = 'processing'`,
    [PAYPAL_WEBHOOK_PROVIDER, eventId, reason],
  );
}

interface AuthorizationRow {
  deal_id: string;
  status: string;
  amount_cents: number;
  currency: string;
}

interface PendingOrderRow {
  deal_id: string;
  amount_cents: number;
  currency: string;
}

interface CaptureOperationRow {
  id: string;
  deal_id: string;
  milestone_id: string;
  requested_amount_cents: number;
  currency: string;
  milestone_amount_cents: number;
  milestone_status: string;
  status: string;
}

async function reconcileAuthorizationCreated(
  client: PoolClient,
  id: string,
  orderId: string | null,
  amountCents: number | null,
  currency: string | null,
): Promise<WebhookProcessOutcome> {
  if (amountCents === null || currency === null) {
    return { outcome: "quarantined", reason: "authorization event missing amount details" };
  }
  if (currency !== "USD") {
    return { outcome: "quarantined", reason: "authorization currency mismatch" };
  }

  // Already recorded (confirm flow completed, or an earlier delivery of this
  // event). Validate the stored amount against the event and confirm.
  const existing = await client.query<AuthorizationRow>(
    `SELECT deal_id, status, amount_cents, currency
     FROM payment_authorizations
     WHERE provider_name = $1 AND provider_reference = $2`,
    [PAYPAL_WEBHOOK_PROVIDER, id],
  );
  if ((existing.rowCount ?? 0) > 0) {
    const row = existing.rows[0];
    // pg returns bigint columns as strings; normalize before comparing.
    if (Number(row.amount_cents) !== amountCents || row.currency !== "USD") {
      return { outcome: "quarantined", reason: "authorization amount mismatch" };
    }
    return { outcome: "processed" };
  }

  if (!orderId) {
    return { outcome: "quarantined", reason: "unknown authorization (no matching order)" };
  }

  // Find the pending order this authorization belongs to. This is the safe
  // reconciliation path for the "buyer approved but confirm timed out" case.
  const order = await client.query<PendingOrderRow>(
    `SELECT deal_id, amount_cents, currency
     FROM payment_orders
     WHERE provider_name = $1 AND provider_order_id = $2`,
    [PAYPAL_WEBHOOK_PROVIDER, orderId],
  );
  if ((order.rowCount ?? 0) === 0) {
    return { outcome: "quarantined", reason: "unknown order id" };
  }
  const pending = order.rows[0];
  if (Number(pending.amount_cents) !== amountCents || pending.currency !== "USD") {
    return { outcome: "quarantined", reason: "order amount mismatch" };
  }

  if (!(await lockDeal(client, pending.deal_id))) {
    return { outcome: "quarantined", reason: "missing deal" };
  }
  const deal = await client.query<{ status: string }>(
    "SELECT status FROM deals WHERE id = $1",
    [pending.deal_id],
  );
  if ((deal.rowCount ?? 0) === 0) {
    return { outcome: "quarantined", reason: "missing deal" };
  }
  if (deal.rows[0].status !== "Ready for Authorization") {
    return { outcome: "quarantined", reason: "unexpected deal state for authorization" };
  }

  // Reconcile: record the authorization hold, drop the pending order, mark the
  // deal Authorized. Same shape as markDealAuthorized() in deals.ts (status
  // column gets the migration-0002 default 'AUTHORIZED').
  try {
    await client.query(
      `INSERT INTO payment_authorizations
         (id, deal_id, provider_name, provider_reference, provider_order_id, simulated, amount_cents, currency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        pending.deal_id,
        PAYPAL_WEBHOOK_PROVIDER,
        id,
        orderId,
        false,
        amountCents,
        "USD",
        now(),
      ],
    );
  } catch (error) {
    // A concurrent confirm/reconcile already recorded the authorization.
    if (!isUniqueViolation(error)) throw error;
    return { outcome: "processed" };
  }
  await client.query("DELETE FROM payment_orders WHERE deal_id = $1", [pending.deal_id]);
  await client.query(
    "UPDATE deals SET status = 'Authorized', updated_at = $2 WHERE id = $1",
    [pending.deal_id, now()],
  );
  await insertAudit(
    client,
    pending.deal_id,
    "payment.authorization_confirmed",
    `Authorization hold ${id} confirmed via ${PAYPAL_WEBHOOK_PROVIDER} (PayPal webhook). This is an authorization hold, not a capture.`,
  );
  return { outcome: "processed" };
}

async function reconcileAuthorizationVoided(
  client: PoolClient,
  id: string,
): Promise<WebhookProcessOutcome> {
  const existing = await client.query<AuthorizationRow>(
    `SELECT deal_id, status, amount_cents, currency
     FROM payment_authorizations
     WHERE provider_name = $1 AND provider_reference = $2`,
    [PAYPAL_WEBHOOK_PROVIDER, id],
  );
  if ((existing.rowCount ?? 0) === 0) {
    return { outcome: "quarantined", reason: "unknown authorization id" };
  }
  const row = existing.rows[0];
  if (row.status === "VOIDED") {
    return { outcome: "processed" }; // idempotent redelivery
  }
  // Guarded single transition: only an AUTHORIZED hold may become VOIDED.
  const updated = await client.query(
    `UPDATE payment_authorizations SET status = 'VOIDED'
     WHERE provider_name = $1 AND provider_reference = $2 AND status = 'AUTHORIZED'`,
    [PAYPAL_WEBHOOK_PROVIDER, id],
  );
  if ((updated.rowCount ?? 0) === 0) {
    return { outcome: "quarantined", reason: "authorization state mismatch" };
  }
  await insertAudit(
    client,
    row.deal_id,
    "payment.authorization_voided",
    `Authorization hold ${id} voided by PayPal. No capture is possible on this hold.`,
  );
  return { outcome: "processed" };
}

async function reconcileCapturePending(
  client: PoolClient,
  providerReference: string | null,
  correlationId: string | null,
): Promise<WebhookProcessOutcome> {
  if (!correlationId) {
    return { outcome: "quarantined", reason: "pending capture missing operation correlation" };
  }
  const operation = await client.query(
    `UPDATE payment_operations
     SET status = CASE
           WHEN status = 'COMPLETED' THEN 'COMPLETED'
           ELSE 'PENDING'
         END,
         provider_reference = COALESCE(provider_reference, $3),
         updated_at = now()
     WHERE provider_name = $1 AND idempotency_key = $2 AND action = 'CAPTURE'
     RETURNING deal_id`,
    [PAYPAL_WEBHOOK_PROVIDER, correlationId, providerReference],
  );
  if ((operation.rowCount ?? 0) !== 1) {
    return { outcome: "quarantined", reason: "pending capture correlation mismatch" };
  }
  return { outcome: "processed" };
}

async function confirmCaptureWithoutCorrelation(
  client: PoolClient,
  id: string,
  amountCents: number,
  currency: string,
): Promise<WebhookProcessOutcome> {
  // No invoice_id on the event. Try to correlate with a human approval first.
  const found = await client.query<{
    approval_id: string | null;
    milestone_id: string | null;
    deal_id: string | null;
    milestone_amount_cents: number | null;
    milestone_status: string | null;
  }>(
    `SELECT ma.id AS approval_id,
            m.id AS milestone_id,
            m.deal_id,
            m.amount_cents AS milestone_amount_cents,
            m.status AS milestone_status
       FROM milestone_approvals ma
       JOIN milestones m ON m.id = ma.milestone_id
      WHERE ma.provider_name = $1
        AND ma.provider_reference = $2
        AND ma.decision = 'approve'
        AND ma.action = 'CAPTURE'`,
    [PAYPAL_WEBHOOK_PROVIDER, id],
  );

  const hasApproval = (found.rowCount ?? 0) === 1;
  if ((found.rowCount ?? 0) > 1) {
    return {
      outcome: "quarantined",
      reason: "capture reference matches multiple human approvals",
    };
  }

  const row = found.rows[0];

  // Always record the provider-confirmed capture in the financial ledger,
  // independently of whether a matching human approval exists.
  let authorizationReference: string | null = null;
  if (hasApproval && row) {
    if (!row.deal_id) {
      return { outcome: "quarantined", reason: "capture approval deal not found" };
    }
    if (!(await lockDeal(client, row.deal_id))) {
      return { outcome: "quarantined", reason: "capture approval deal not found" };
    }
    if (row.milestone_amount_cents !== null && Number(row.milestone_amount_cents) !== amountCents) {
      return { outcome: "quarantined", reason: "capture amount mismatch" };
    }
    if (currency !== "USD") {
      return { outcome: "quarantined", reason: "capture currency mismatch" };
    }

    const authorization = await client.query<{
      provider_reference: string;
      currency: string;
    }>(
      `SELECT provider_reference, currency
         FROM payment_authorizations
        WHERE deal_id = $1
        FOR UPDATE`,
      [row.deal_id as string],
    );
    if ((authorization.rowCount ?? 0) === 0) {
      return { outcome: "quarantined", reason: "capture authorization missing" };
    }
    authorizationReference = authorization.rows[0].provider_reference;
  } else {
    // No matching human approval: record the capture as a reconciliation
    // exception. The capture itself is durably accounted for; the missing
    // approval is flagged for manual review. deal_id and milestone_id are
    // unknown without an approval or invoice_id correlation, so they are
    // stored as NULL and the exception is visible in the audit trail.
  }

  await client.query(
    `INSERT INTO payment_captures
       (id, deal_id, milestone_id, provider_name, provider_reference,
        authorization_reference, amount_cents, currency, invoice_id, status,
        simulated, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, 'COMPLETED', false, now())
     ON CONFLICT (provider_name, provider_reference) DO NOTHING`,
    [
      randomUUID(),
      row?.deal_id ?? null,
      row?.milestone_id ?? null,
      PAYPAL_WEBHOOK_PROVIDER,
      id,
      authorizationReference,
      amountCents,
      currency,
    ],
  );

  if (hasApproval && row) {
    await client.query(
      `UPDATE milestone_approvals
          SET payment_status = 'COMPLETED', provider_reference = $2
        WHERE id = $1`,
      [row.approval_id, id],
    );
    await client.query(
      `UPDATE milestones SET status = 'Completed', updated_at = now()
        WHERE id = $1 AND status <> 'Completed'`,
      [row.milestone_id],
    );
    await insertAudit(
      client,
      row.deal_id as string,
      "payment.capture_confirmed",
      `Capture ${id} completed by PayPal for milestone.`,
      row.milestone_id as string,
    );
  } else {
    await insertAudit(
      client,
      null,
      "payment.capture_confirmed_without_approval",
      `Capture ${id} completed by PayPal but no matching human approval was found. deal_id and milestone_id unknown; reconciliation required.`,
      null,
    );
  }
  return { outcome: "processed" };
}

async function reconcileCaptureCompleted(
  client: PoolClient,
  id: string,
  amountCents: number | null,
  currency: string | null,
  correlationId: string | null,
): Promise<WebhookProcessOutcome> {
  if (amountCents === null || currency === null) {
    return { outcome: "quarantined", reason: "capture event missing amount details" };
  }
  if (!correlationId) {
    return confirmCaptureWithoutCorrelation(client, id, amountCents, currency);
  }
  const operation = await client.query<CaptureOperationRow>(
    `SELECT po.id, po.deal_id, po.milestone_id, po.requested_amount_cents,
            po.currency, m.amount_cents AS milestone_amount_cents, m.status AS milestone_status,
            po.status
     FROM payment_operations po
     JOIN milestones m ON m.id = po.milestone_id
     WHERE po.provider_name = $1
       AND po.idempotency_key = $2
       AND po.action = 'CAPTURE'`,
    [PAYPAL_WEBHOOK_PROVIDER, correlationId],
  );
  if ((operation.rowCount ?? 0) !== 1) {
    return {
      outcome: "quarantined",
      reason: "capture correlation does not identify one payment operation",
    };
  }
  const row = operation.rows[0];
  if (!(await lockDeal(client, row.deal_id))) {
    return { outcome: "quarantined", reason: "capture operation deal not found" };
  }
  if (Number(row.milestone_amount_cents) !== amountCents || currency !== "USD") {
    return { outcome: "quarantined", reason: "capture amount mismatch" };
  }
  if (row.currency !== currency || Number(row.requested_amount_cents) !== amountCents) {
    return { outcome: "quarantined", reason: "capture operation amount mismatch" };
  }
  const approval = await client.query<{ id: string }>(
    `SELECT id FROM milestone_approvals
     WHERE milestone_id = $1 AND decision = 'approve' AND action = 'CAPTURE'
     LIMIT 1`,
    [row.milestone_id],
  );
  const conflictingCapture = await client.query(
    `SELECT pc.deal_id, pc.milestone_id, po.id AS operation_id
     FROM payment_captures pc
     LEFT JOIN payment_operations po
       ON po.deal_id = pc.deal_id
      AND po.milestone_id = pc.milestone_id
      AND po.provider_reference = pc.provider_reference
     WHERE pc.provider_name = $1 AND pc.provider_reference = $2`,
    [PAYPAL_WEBHOOK_PROVIDER, id],
  );
  if ((conflictingCapture.rowCount ?? 0) > 0) {
    const owner = conflictingCapture.rows[0];
    if (owner.deal_id !== row.deal_id || owner.milestone_id !== row.milestone_id ||
        owner.operation_id !== row.id) {
      return { outcome: "quarantined", reason: "capture id belongs to conflicting payment operation" };
    }
  }
  await client.query(
    `UPDATE payment_operations
     SET status = CASE WHEN status IN ('COMPLETED', 'VOIDED') THEN status ELSE 'COMPLETED' END,
         provider_reference = COALESCE(provider_reference, $2), updated_at = now()
     WHERE id = $1`,
    [row.id, id],
  );
  await client.query(
    `INSERT INTO payment_captures
       (id, deal_id, milestone_id, provider_name, provider_reference,
        authorization_reference, amount_cents, currency, invoice_id, status, simulated, created_at)
     SELECT $1, $2, $3, $4, $5,
             pa.provider_reference, $6, $7, po.idempotency_key, 'COMPLETED', false, now()
        FROM payment_authorizations pa
        JOIN payment_operations po ON po.id = $8
         AND po.deal_id = $2 AND po.milestone_id = $3 AND po.action = 'CAPTURE'
        WHERE pa.deal_id = $2
     ON CONFLICT (provider_name, provider_reference) DO NOTHING`,
    [randomUUID(), row.deal_id, row.milestone_id, PAYPAL_WEBHOOK_PROVIDER, id, amountCents, currency, row.id],
  );
  if ((approval.rowCount ?? 0) > 0) {
    await client.query(
      `UPDATE milestone_approvals
        SET payment_status = 'COMPLETED', provider_reference = $2
        WHERE milestone_id = $1 AND decision = 'approve' AND action = 'CAPTURE'`,
      [row.milestone_id, id],
    );
    await client.query(
      `UPDATE milestones SET status = 'Completed', updated_at = now()
        WHERE id = $1 AND status <> 'Completed'`,
      [row.milestone_id],
    );
  }
  // The human approval flow already moved the milestone to Completed; a
  // redelivery is a no-op. Never regress or advance milestone state here.
  if (row.milestone_status === "Completed") {
    await insertAudit(
      client,
      row.deal_id,
      "payment.capture_confirmed",
      `Capture ${id} completed by PayPal for milestone.`,
      row.milestone_id,
    );
    return { outcome: "processed" };
  }
  // Evidence recorded even when the milestone is not yet Completed (async
  // capture); completion still belongs to the human approval flow.
  await insertAudit(
    client,
    row.deal_id,
    "payment.capture_confirmed",
    `Capture ${id} completed by PayPal for milestone (milestone not yet marked Completed).`,
    row.milestone_id,
  );
  return { outcome: "processed" };
}

/**
 * Process one verified PayPal webhook event durably and idempotently.
 *
 * Throws on infrastructure/database failures (nothing persisted; callers must
 * return 5xx so PayPal redelivers). Returns outcome "quarantined" for
 * state/amount mismatches (row committed with status 'failed' for operations
 * review; the delivery is acknowledged 2xx and not auto-retried). Returns
 * "duplicate" for deliveries that were already processed or are being
 * processed concurrently.
 */
export async function processWebhookEvent(
  event: unknown,
): Promise<WebhookProcessOutcome> {
  if (!event || typeof event !== "object") {
    return { outcome: "quarantined", reason: "invalid event payload" };
  }
  const record = event as Record<string, unknown>;
  const eventId = typeof record.id === "string" ? record.id : null;
  const eventType = typeof record.event_type === "string" ? record.event_type : null;
  if (!eventId || !eventType) {
    return { outcome: "quarantined", reason: "invalid event payload (missing id or type)" };
  }

  return withTransaction(async (client) => {
    // 1. Durably record receipt. UNIQUE(provider, event_id) makes conflicts a
    //    no-op backstop for duplicate deliveries.
    await client.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload, status, attempts, received_at)
       VALUES ($1, $2, $3, $4, 'received', 0, $5)
       ON CONFLICT (provider, event_id) DO NOTHING`,
      [PAYPAL_WEBHOOK_PROVIDER, eventId, eventType, JSON.stringify(event), now()],
    );

    // 2. Claim the row atomically. 0 rows = duplicate (already processed, or a
    //    concurrent delivery claimed it first).
    const claimed = await client.query(
      `UPDATE webhook_events
       SET status = 'processing', attempts = attempts + 1, last_error = NULL
       WHERE provider = $1 AND event_id = $2 AND status IN ('received', 'failed')
       RETURNING id`,
      [PAYPAL_WEBHOOK_PROVIDER, eventId],
    );
    if ((claimed.rowCount ?? 0) === 0) {
      return { outcome: "duplicate" } satisfies WebhookProcessOutcome;
    }

    // 3. Neutral mapping (signature already verified by the caller).
    const normalized = mapWebhookEvent(event);
    if (normalized.kind === "unknown") {
      await markProcessed(client, eventId, "unsupported event type");
      return { outcome: "unsupported", reason: "unsupported event type" } satisfies WebhookProcessOutcome;
    }
    if (normalized.id === null) {
      await markQuarantined(client, eventId, "event resource missing id");
      return { outcome: "quarantined", reason: "event resource missing id" } satisfies WebhookProcessOutcome;
    }

    // 4. Reconcile against authoritative state in the same transaction.
    let result: WebhookProcessOutcome;
    switch (normalized.kind) {
      case "authorization_created":
        result = await reconcileAuthorizationCreated(
          client,
          normalized.id,
          normalized.orderId,
          normalized.amountCents,
          normalized.currency,
        );
        break;
      case "authorization_voided":
        result = await reconcileAuthorizationVoided(client, normalized.id);
        break;
      case "capture_completed":
        result = await reconcileCaptureCompleted(
          client,
          normalized.id,
          normalized.amountCents,
          normalized.currency,
          normalized.correlationId,
        );
        break;
      case "capture_pending":
        result = await reconcileCapturePending(
          client,
          normalized.id,
          normalized.correlationId,
        );
        break;
      default:
        result = { outcome: "unsupported", reason: "unsupported event type" };
    }

    // 5. Record the terminal outcome and commit everything together.
    if (result.outcome === "quarantined") {
      await markQuarantined(client, eventId, result.reason);
    } else {
      await markProcessed(
        client,
        eventId,
        result.outcome === "unsupported" ? result.reason : null,
      );
    }
    return result;
  });
}