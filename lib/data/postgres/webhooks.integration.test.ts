/**
 * PostgreSQL integration tests for webhook reconciliation.
 *
 * These tests run only when FAIRHOLD_TEST_DATABASE_URL is set (an isolated
 * database). Without it, every test is skipped with a clear reason.
 *
 * Covered here: idempotent receipt (webhook_events unique key), concurrent
 * deliveries, reconciliation of authorization/capture events against the
 * payment records, amount/currency mismatch quarantine, out-of-order and
 * retry-after-failure semantics, the rule that a webhook can never approve a
 * human decision or trigger a capture, and full-rollback on transient
 * database failures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { runMigrations } from "./migrate.ts";
import {
  prepareIntegrationDatabase,
  type IntegrationDatabase,
} from "./integration-database.ts";
import { processWebhookEvent } from "./webhooks.ts";
import { addMilestone, createDeal, recordMilestoneApproval, setDealStatus, setPendingAuthorization } from "./deals.ts";
import type { Deal } from "../../domain/types.ts";

const TEST_URL = process.env.FAIRHOLD_TEST_DATABASE_URL;
const live = Boolean(TEST_URL);

const skipReason = live
  ? false
  : "set FAIRHOLD_TEST_DATABASE_URL (isolated Postgres) to run these tests";

let pool: pg.Pool;
let database: IntegrationDatabase | null = null;

test.before(async () => {
  if (!TEST_URL) return;
  // Each test file gets its own schema so parallel files cannot interfere.
  database = await prepareIntegrationDatabase(TEST_URL, "webhooks");
  // The implementation reads DATABASE_URL lazily on first use; point it at the
  // isolated schema before any call.
  process.env.DATABASE_URL = database.connectionString;
  pool = new pg.Pool({ connectionString: database.connectionString, max: 2 });
  await runMigrations(pool);
});

test.after(async () => {
  if (pool) await pool.end();
  await database?.drop();
  database = null;
});

function newDealInput() {
  return {
    title: `Webhook deal ${randomUUID().slice(0, 8)}`,
    agreement: "An agreement text that is long enough to pass validation.",
    clientName: "Client",
    freelancerName: "Freelancer",
    currency: "USD",
  };
}

/** Draft deal with one 25000-cent milestone, moved to Ready for Authorization. */
async function seedDealReadyForAuthorization() {
  const deal = await createDeal(newDealInput(), "system");
  const milestone = await addMilestone(
    deal.id,
    {
      title: "Milestone one",
      description: "Do the thing.",
      amountCents: 25000,
      dueDate: null,
      acceptanceCriteria: "Thing is done and accepted.",
    },
    "system",
  );
  assert.equal(milestone.ok, true);
  const milestoneId = (milestone as { ok: true; deal: Deal }).deal.milestones[0].id;
  assert.equal((await setDealStatus(deal.id, "Awaiting Agreement", "system")).ok, true);
  assert.equal((await setDealStatus(deal.id, "Ready for Authorization", "system")).ok, true);
  return { deal, milestoneId };
}

function authorizationCreatedEvent(authId: string, orderId: string, amountCents = 25000) {
  return {
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.AUTHORIZATION.CREATED",
    resource: {
      id: authId,
      amount: { currency_code: "USD", value: (amountCents / 100).toFixed(2) },
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  };
}

test("webhook: authorization_created reconciles a pending order into an authorized deal", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );

  const outcome = await processWebhookEvent(authorizationCreatedEvent("AUTH-W1", orderId));
  assert.equal(outcome.outcome, "processed");

  const orderRows = await pool.query("SELECT * FROM payment_orders WHERE provider_order_id = $1", [orderId]);
  assert.equal(orderRows.rowCount, 0, "pending order must be consumed by reconciliation");

  const authRows = await pool.query(
    "SELECT provider_reference, status, amount_cents, currency, simulated FROM payment_authorizations WHERE provider_reference = $1",
    ["AUTH-W1"],
  );
  assert.equal(authRows.rowCount, 1);
  assert.equal(authRows.rows[0].status, "AUTHORIZED");
  assert.equal(Number(authRows.rows[0].amount_cents), 25000);
  assert.equal(authRows.rows[0].currency, "USD");
  assert.equal(authRows.rows[0].simulated, false);

  const dealRows = await pool.query("SELECT status FROM deals WHERE id = $1", [deal.id]);
  assert.equal(dealRows.rows[0].status, "Authorized");

  const auditRows = await pool.query(
    "SELECT type FROM audit_events WHERE deal_id = $1 AND type = 'payment.authorization_confirmed'",
    [deal.id],
  );
  assert.equal(auditRows.rowCount, 1);
});

test("webhook: duplicate delivery is idempotent — reconciled once, one audit row", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  const event = authorizationCreatedEvent("AUTH-WD", orderId);

  const first = await processWebhookEvent(event);
  assert.equal(first.outcome, "processed");
  const second = await processWebhookEvent(event);
  assert.equal(second.outcome, "duplicate");

  const auditRows = await pool.query(
    "SELECT type FROM audit_events WHERE deal_id = $1 AND type = 'payment.authorization_confirmed'",
    [deal.id],
  );
  assert.equal(auditRows.rowCount, 1, "exactly one reconciliation audit row");

  const webhookRows = await pool.query("SELECT status, attempts FROM webhook_events WHERE event_id = $1", [
    (event as { id: string }).id,
  ]);
  assert.equal(webhookRows.rowCount, 1);
  assert.equal(webhookRows.rows[0].status, "processed");
  assert.equal(webhookRows.rows[0].attempts, 1, "duplicate delivery must not bump attempts");
});

test("webhook: authorization_created with an unknown order is quarantined", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();

  const outcome = await processWebhookEvent(
    authorizationCreatedEvent("AUTH-UNKNOWN", `ORDER-NOPE-${randomUUID().slice(0, 8)}`),
  );
  assert.equal(outcome.outcome, "quarantined");
  assert.match((outcome as { reason: string }).reason, /unknown order/);

  const dealRows = await pool.query("SELECT status FROM deals WHERE id = $1", [deal.id]);
  assert.equal(dealRows.rows[0].status, "Ready for Authorization", "deal must remain unchanged");

  // Verify the webhook inbox row was quarantined (this test's own event was the
  // last one inserted); scope by provider + failed status to avoid cross-test
  // interference.
  const webhookRows = await pool.query(
    "SELECT status, last_error FROM webhook_events WHERE status = 'failed' ORDER BY received_at DESC LIMIT 1",
  );
  assert.equal(webhookRows.rows[0].status, "failed");
  assert.match(webhookRows.rows[0].last_error, /unknown order/);
});

test("webhook: authorization_created amount mismatch is quarantined", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );

  const outcome = await processWebhookEvent(authorizationCreatedEvent("AUTH-AMT", orderId, 99999));
  assert.equal(outcome.outcome, "quarantined");
  assert.match((outcome as { reason: string }).reason, /amount mismatch/);

  const dealRows = await pool.query("SELECT status FROM deals WHERE id = $1", [deal.id]);
  assert.equal(dealRows.rows[0].status, "Ready for Authorization");
});

test("webhook: authorization_created with mismatched currency is quarantined", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );

  const event = authorizationCreatedEvent("AUTH-CUR", orderId);
  (event.resource as { amount: { currency_code: string } }).amount.currency_code = "EUR";
  const outcome = await processWebhookEvent(event);
  assert.equal(outcome.outcome, "quarantined");
  assert.match((outcome as { reason: string }).reason, /currency/);
});

test("webhook: authorization_voided marks the authorization VOIDED without regressing the deal", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const authId = `AUTH-V-${randomUUID().slice(0, 8)}`;
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  // Reconcile first, then void.
  assert.equal((await processWebhookEvent(authorizationCreatedEvent(authId, orderId))).outcome, "processed");

  const outcome = await processWebhookEvent({
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.AUTHORIZATION.VOIDED",
    resource: { id: authId },
  });
  assert.equal(outcome.outcome, "processed");

  const authRows = await pool.query("SELECT status FROM payment_authorizations WHERE provider_reference = $1", [authId]);
  assert.equal(authRows.rows[0].status, "VOIDED");

  const auditRows = await pool.query(
    "SELECT type FROM audit_events WHERE deal_id = $1 AND type = 'payment.authorization_voided'",
    [deal.id],
  );
  assert.equal(auditRows.rowCount, 1);

  const dealRows = await pool.query("SELECT status FROM deals WHERE id = $1", [deal.id]);
  assert.equal(dealRows.rows[0].status, "Authorized", "void is lifecycle evidence; humans decide the deal next");
});

test("webhook: authorization_voided with unknown id is quarantined", { skip: skipReason }, async () => {
  const outcome = await processWebhookEvent({
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.AUTHORIZATION.VOIDED",
    resource: { id: "AUTH-NOPE" },
  });
  assert.equal(outcome.outcome, "quarantined");
  assert.match((outcome as { reason: string }).reason, /unknown authorization/);
});

test("webhook: voided redelivery stays processed without double audits", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const authId = `AUTH-VR-${randomUUID().slice(0, 8)}`;
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  assert.equal((await processWebhookEvent(authorizationCreatedEvent(authId, orderId))).outcome, "processed");

  const event = {
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.AUTHORIZATION.VOIDED",
    resource: { id: authId },
  };
  assert.equal((await processWebhookEvent(event)).outcome, "processed");
  const redelivery = await processWebhookEvent(event);
  assert.equal(redelivery.outcome, "duplicate", "same event id is a duplicate even when idempotent in effect");

  const auditRows = await pool.query(
    "SELECT type FROM audit_events WHERE deal_id = $1 AND type = 'payment.authorization_voided'",
    [deal.id],
  );
  assert.equal(auditRows.rowCount, 1);
});

test("webhook: capture_completed without a matching human approval is quarantined — webhooks cannot trigger captures", { skip: skipReason }, async () => {
  const outcome = await processWebhookEvent({
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "CAP-ROGUE",
      amount: { currency_code: "USD", value: "250.00" },
    },
  });
  assert.equal(outcome.outcome, "quarantined");
  assert.match((outcome as { reason: string }).reason, /no matching human approval/);
});

test("webhook: capture_completed confirms an existing approved+CAPTURE milestone", { skip: skipReason }, async () => {
  const { deal, milestoneId } = await seedDealReadyForAuthorization();
  const authId = `AUTH-CC-${randomUUID().slice(0, 8)}`;
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  assert.equal((await processWebhookEvent(authorizationCreatedEvent(authId, orderId))).outcome, "processed");

  const approval = await recordMilestoneApproval(
    deal.id,
    milestoneId,
    {
      id: randomUUID(),
      decision: "approve",
      action: "CAPTURE",
      reasonCodes: ["EVIDENCE_ACCEPTED"],
      explanation: "Approved by the human reviewer.",
      evidenceFingerprint: "fp-webhook",
      evidenceReviewedCount: 1,
      reviewedBy: "reviewer@example.test",
      reviewedAt: new Date().toISOString(),
      providerReference: "CAP-CONFIRMED",
      providerName: "paypal-sandbox",
      simulated: false,
      note: null,
    },
    "system",
  );
  assert.equal(approval.ok, true);

  const outcome = await processWebhookEvent({
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "CAP-CONFIRMED",
      amount: { currency_code: "USD", value: "250.00" },
    },
  });
  assert.equal(outcome.outcome, "processed");

  const auditRows = await pool.query(
    "SELECT type FROM audit_events WHERE deal_id = $1 AND type = 'payment.capture_confirmed'",
    [deal.id],
  );
  assert.equal(auditRows.rowCount, 1);
});

test("webhook: concurrent deliveries of the same event — exactly one processes", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  const event = authorizationCreatedEvent("AUTH-CONC", orderId);

  const results = await Promise.all([processWebhookEvent(event), processWebhookEvent(event)]);
  const processed = results.filter((r) => r.outcome === "processed").length;
  const duplicates = results.filter((r) => r.outcome === "duplicate").length;
  assert.equal(processed, 1, "exactly one delivery must reconcile");
  assert.equal(duplicates, 1, "the other must be a duplicate");

  const auditRows = await pool.query(
    "SELECT type FROM audit_events WHERE deal_id = $1 AND type = 'payment.authorization_confirmed'",
    [deal.id],
  );
  assert.equal(auditRows.rowCount, 1);
});

test("webhook: a failed (quarantined) row can be claimed again on redelivery with corrected state", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const authId = `AUTH-RETRY-${randomUUID().slice(0, 8)}`;
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  const event = authorizationCreatedEvent(authId, orderId);

  // First delivery: no such order → quarantined (row status 'failed').
  const first = await processWebhookEvent(event);
  assert.equal(first.outcome, "quarantined");
  let webhookRows = await pool.query("SELECT status FROM webhook_events WHERE event_id = $1", [
    (event as { id: string }).id,
  ]);
  assert.equal(webhookRows.rows[0].status, "failed");

  // State is corrected (order created), same event id redelivered → re-claimed and processed.
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  const second = await processWebhookEvent(event);
  assert.equal(second.outcome, "processed");

  webhookRows = await pool.query("SELECT status, attempts FROM webhook_events WHERE event_id = $1", [
    (event as { id: string }).id,
  ]);
  assert.equal(webhookRows.rows[0].status, "processed");
  assert.equal(webhookRows.rows[0].attempts, 2, "redelivery after failure increments attempts");
});

test("webhook: transient database failure rolls back the whole delivery", { skip: skipReason }, async () => {
  const { deal } = await seedDealReadyForAuthorization();
  const orderId = `ORDER-${randomUUID().slice(0, 8)}`;
  await setPendingAuthorization(
    deal.id,
    {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: orderId,
      approvalUrl: "https://sandbox.paypal.com/checkout/approve",
      amountCents: 25000,
      currency: "USD",
    },
    "system",
  );
  const event = authorizationCreatedEvent("AUTH-TRANS", orderId);

  // Force every audit insert to fail mid-transaction.
  await pool.query(`
    CREATE FUNCTION fail_audit() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'boom'; END;
    $$ LANGUAGE plpgsql`);
  await pool.query(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_audit()",
  );

  let threw = false;
  try {
    await processWebhookEvent(event);
  } catch {
    threw = true;
  } finally {
    await pool.query("DROP TRIGGER fail_audit ON audit_events");
    await pool.query("DROP FUNCTION fail_audit()");
  }
  assert.equal(threw, true, "transient DB failure must surface as an error, not a quiet success");

  const webhookRows = await pool.query("SELECT * FROM webhook_events WHERE event_id = $1", [
    (event as { id: string }).id,
  ]);
  assert.equal(webhookRows.rowCount, 0, "no webhook row may persist from a rolled-back delivery");

  const authRows = await pool.query(
    "SELECT * FROM payment_authorizations WHERE provider_reference = $1",
    ["AUTH-TRANS"],
  );
  assert.equal(authRows.rowCount, 0, "no authorization may persist from a rolled-back delivery");

  const dealRows = await pool.query("SELECT status FROM deals WHERE id = $1", [deal.id]);
  assert.equal(dealRows.rows[0].status, "Ready for Authorization", "deal state must be untouched");
});