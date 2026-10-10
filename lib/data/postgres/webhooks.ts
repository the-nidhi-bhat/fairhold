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
 * here can approve a human decision, move a milestone, or trigger a capture.
 * capture_completed only ever records evidence for an approval that a human
 * already recorded (and that already moved the milestone to Completed).
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
  dealId: string,
  type: string,
  message: string,
  milestoneId?: string,
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

interface ApprovalRow {
  deal_id: string;
  milestone_id: string;
  decision: string;
  action: string;
  milestone_status: string;
  milestone_amount_cents: number;
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

async function reconcileCaptureCompleted(
  client: PoolClient,
  id: string,
  amountCents: number | null,
  currency: string | null,
): Promise<WebhookProcessOutcome> {
  // The capture must match a HUMAN approval that already recorded the capture
  // provider reference. No match = a capture that FairHold never approved.
  const approval = await client.query<ApprovalRow>(
    `SELECT m.deal_id, ma.milestone_id, ma.decision, ma.action,
            m.status AS milestone_status, m.amount_cents AS milestone_amount_cents
     FROM milestone_approvals ma
     JOIN milestones m ON m.id = ma.milestone_id
     WHERE ma.provider_name = $1 AND ma.provider_reference = $2`,
    [PAYPAL_WEBHOOK_PROVIDER, id],
  );
  if ((approval.rowCount ?? 0) === 0) {
    return {
      outcome: "quarantined",
      reason: "unknown capture (no matching human approval)",
    };
  }
  const row = approval.rows[0];
  if (row.action !== "CAPTURE" || row.decision !== "approve") {
    return {
      outcome: "quarantined",
      reason: "capture without approve/CAPTURE approval",
    };
  }
  if (amountCents === null || currency === null) {
    return { outcome: "quarantined", reason: "capture event missing amount details" };
  }
  if (Number(row.milestone_amount_cents) !== amountCents || currency !== "USD") {
    return { outcome: "quarantined", reason: "capture amount mismatch" };
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
        );
        break;
      case "capture_pending":
        result = {
          outcome: "quarantined",
          reason: "unexpected capture state PENDING — FairHold treats captures as synchronous; no settlement claimed",
        };
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