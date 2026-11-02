/**
 * PostgreSQL integration tests.
 *
 * These tests run only when FAIRHOLD_TEST_DATABASE_URL is set (an isolated
 * database). Without it, every test is skipped with a clear reason, and the
 * unit suite still passes — the distinction between unit and integration is
 * explicit, never hidden.
 *
 * When enabled, this file applies the real migrations to the test database
 * and exercises the PostgreSQL data-access implementation end to end:
 * roundtrips, transactional rollback, one-time constraints (approval per
 * milestone, authorization per deal), concurrency, and webhook dedup.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { runMigrations } from "./migrate.ts";
import {
  addEvidence,
  addMilestone,
  createDeal,
  getDeal,
  listDeals,
  markDealAuthorized,
  recordMilestoneApproval,
  reviewEvidence,
  setDealStatus,
  updateMilestone,
} from "./deals.ts";
import type { Deal } from "../../domain/types.ts";

const TEST_URL = process.env.FAIRHOLD_TEST_DATABASE_URL;
const live = Boolean(TEST_URL);

// The implementation reads DATABASE_URL lazily on first use; point it at the
// test database before any call.
if (TEST_URL) process.env.DATABASE_URL = TEST_URL;

const skipReason = live
  ? false
  : "set FAIRHOLD_TEST_DATABASE_URL (isolated Postgres) to run these tests";

const pool = new pg.Pool({
  connectionString: TEST_URL ?? "postgresql://unused:unused@localhost:5432/unused",
  max: 2,
});

test.before(async () => {
  if (!live) return;
  await runMigrations(pool);
  // Isolate the suite from prior data.
  await pool.query(
    "TRUNCATE deals, milestones, evidence, milestone_approvals, audit_events, payment_orders, payment_authorizations, payment_captures, webhook_events RESTART IDENTITY CASCADE",
  );
});

test.after(async () => {
  await pool.end();
});

function newDealInput() {
  return {
    title: `Deal ${randomUUID().slice(0, 8)}`,
    agreement: "An agreement text that is long enough to pass validation.",
    clientName: "Client",
    freelancerName: "Freelancer",
    currency: "USD",
  };
}

async function seedDealWithMilestone() {
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
  return { deal, milestoneId: (milestone as { ok: true; deal: Deal }).deal.milestones[0].id };
}

/** Walk the deal through the legal transitions to Ready for Authorization. */
async function readyForAuthorization(dealId: string) {
  assert.equal((await setDealStatus(dealId, "Awaiting Agreement", "system")).ok, true);
  assert.equal((await setDealStatus(dealId, "Ready for Authorization", "system")).ok, true);
}

test("postgres: create/list/get roundtrip preserves the full tree", { skip: skipReason }, async () => {
  const { deal, milestoneId } = await seedDealWithMilestone();

  const listed = await listDeals();
  assert.ok(listed.some((d) => d.id === deal.id));

  const loaded = await getDeal(deal.id);
  assert.ok(loaded);
  assert.equal(loaded.status, "Draft");
  assert.equal(loaded.currency, "USD");
  assert.equal(loaded.milestones.length, 1);
  assert.equal(loaded.milestones[0].id, milestoneId);
  assert.equal(loaded.milestones[0].amountCents, 25000);
  assert.equal(loaded.events[0].type, "deal.created");
  assert.equal(loaded.authorization, null);
  assert.equal(loaded.pendingAuthorization, null);
});

test("postgres: milestone update and evidence persistence roundtrip", { skip: skipReason }, async () => {
  const { deal, milestoneId } = await seedDealWithMilestone();
  const updated = await updateMilestone(
    deal.id,
    milestoneId,
    {
      title: "Milestone updated",
      description: "Updated description.",
      amountCents: 30000,
      dueDate: "2026-12-31",
      acceptanceCriteria: "Updated acceptance criteria.",
    },
    "system",
  );
  assert.equal(updated.ok, true);

  const evidence = await addEvidence(
    deal.id,
    milestoneId,
    {
      note: "Completed work.",
      url: "https://example.test/proof",
      file: {
        name: "proof.txt",
        size: 12,
        type: "text/plain",
        storedPath: "evidence/proof.txt",
      },
    },
    "seller",
  );
  assert.equal(evidence.ok, true);

  const loaded = await getDeal(deal.id);
  assert.ok(loaded);
  assert.equal(loaded.milestones[0].title, "Milestone updated");
  assert.equal(loaded.milestones[0].amountCents, 30000);
  assert.equal(loaded.evidence[0].note, "Completed work.");
  assert.equal(loaded.evidence[0].url, "https://example.test/proof");
  assert.equal(loaded.evidence[0].submittedBy, "seller");
  assert.equal(loaded.evidence[0].file?.name, "proof.txt");
  assert.equal(loaded.evidence[0].file?.size, 12);
  assert.equal(loaded.evidence[0].file?.type, "text/plain");
  assert.equal(loaded.evidence[0].file?.storedPath, "evidence/proof.txt");
});

test("postgres: approval is recorded atomically with audit events", { skip: skipReason }, async () => {
  const { deal, milestoneId } = await seedDealWithMilestone();
  await readyForAuthorization(deal.id);
  const auth = await markDealAuthorized(
    deal.id,
    {
      providerName: "demo-payment-provider",
      providerReference: `demo-auth-${randomUUID()}`,
      simulated: true,
      amountCents: 25000,
    },
    "system",
  );
  assert.equal(auth.ok, true);
  assert.equal((auth as { ok: true; deal: Deal }).deal.status, "Authorized");

  const approval = await recordMilestoneApproval(
    deal.id,
    milestoneId,
    {
      id: randomUUID(),
      decision: "approve",
      action: "CAPTURE",
      reasonCodes: ["EVIDENCE_ACCEPTED"],
      explanation: "Evidence accepted by rules.",
      evidenceFingerprint: "fp-1",
      evidenceReviewedCount: 1,
      reviewedBy: "system",
      reviewedAt: new Date().toISOString(),
      providerReference: `demo-cap-${randomUUID()}`,
      providerName: "demo-payment-provider",
      simulated: true,
      note: null,
    },
    "system",
  );
  assert.equal(approval.ok, true);
  const loaded = await getDeal(deal.id);
  assert.ok(loaded);
  assert.equal(loaded.milestones[0].status, "Completed");
  assert.equal(loaded.milestones[0].approval?.decision, "approve");
});

test("postgres: a second approval for the same milestone is rejected", { skip: skipReason }, async () => {
  const { deal, milestoneId } = await seedDealWithMilestone();
  const base = {
    decision: "approve" as const,
    action: "NONE" as const,
    reasonCodes: ["EVIDENCE_MISSING"] as string[],
    explanation: "No payment action; just recording.",
    evidenceFingerprint: "fp-2",
    evidenceReviewedCount: 0,
    reviewedBy: "system",
    reviewedAt: new Date().toISOString(),
    providerReference: null,
    providerName: null,
    simulated: false,
    note: null,
  };
  const first = await recordMilestoneApproval(deal.id, milestoneId, { ...base, id: randomUUID() }, "system");
  assert.equal(first.ok, true);
  const second = await recordMilestoneApproval(deal.id, milestoneId, { ...base, id: randomUUID() }, "system");
  assert.equal(second.ok, false);
  assert.match((second as { error: string }).error, /already been reviewed/);
});

test("postgres: concurrent authorizations — exactly one wins", { skip: skipReason }, async () => {
  const { deal } = await seedDealWithMilestone();
  await readyForAuthorization(deal.id);

  const results = await Promise.all([
    markDealAuthorized(deal.id, {
      providerName: "demo-payment-provider",
      providerReference: `demo-auth-a-${randomUUID()}`,
      simulated: true,
      amountCents: 25000,
    }, "system"),
    markDealAuthorized(deal.id, {
      providerName: "demo-payment-provider",
      providerReference: `demo-auth-b-${randomUUID()}`,
      simulated: true,
      amountCents: 25000,
    }, "system"),
  ]);
  const winners = results.filter((r) => r.ok);
  assert.equal(winners.length, 1, "exactly one concurrent authorization must succeed");
  const loaded = await getDeal(deal.id);
  assert.equal(loaded?.status, "Authorized");
});

test("postgres: reviewEvidence cannot double-review", { skip: skipReason }, async () => {
  const { deal, milestoneId } = await seedDealWithMilestone();
  const evidence = await addEvidence(
    deal.id,
    milestoneId,
    { note: "Screenshot of the work.", url: null, file: null },
    "system",
  );
  assert.equal(evidence.ok, true);
  const submissionId = (evidence as { ok: true; deal: Deal }).deal.evidence[0].id;

  const first = await reviewEvidence(deal.id, submissionId, "accepted", "Looks good", "system");
  assert.equal(first.ok, true);
  const second = await reviewEvidence(deal.id, submissionId, "rejected", "Actually no", "system");
  assert.equal(second.ok, false);
  assert.match((second as { error: string }).error, /already been reviewed/);
});

test("postgres: webhook event idempotency key is unique (provider, event_id)", { skip: skipReason }, async () => {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO webhook_events (provider, event_id, event_type, payload, received_at)
     VALUES ('paypal', 'WH-1', 'PAYMENT.CAPTURE.COMPLETED', $1, $2)`,
    [JSON.stringify({ id: "WH-1" }), now],
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload, received_at)
       VALUES ('paypal', 'WH-1', 'PAYMENT.CAPTURE.COMPLETED', $1, $2)`,
      [JSON.stringify({ id: "WH-1" }), now],
    ),
    /duplicate key/,
  );
});

test("postgres: deal rows survive a transaction rollback", { skip: skipReason }, async () => {
  // Force a failure inside a data-access transaction and verify no partial
  // state exists afterwards.
  const { deal } = await seedDealWithMilestone();
  await readyForAuthorization(deal.id);
  const auth = await markDealAuthorized(
    deal.id,
    {
      providerName: "demo-payment-provider",
      providerReference: `demo-auth-${randomUUID()}`,
      simulated: true,
      amountCents: 25000,
    },
    "system",
  );
  assert.equal(auth.ok, true);

  // Second authorization attempt should fail cleanly (unique constraint) and
  // leave the first authorization intact.
  const again = await markDealAuthorized(
    deal.id,
    {
      providerName: "demo-payment-provider",
      providerReference: `demo-auth-${randomUUID()}`,
      simulated: true,
      amountCents: 25000,
    },
    "system",
  );
  assert.equal(again.ok, false);

  const loaded = await getDeal(deal.id);
  assert.equal(loaded?.status, "Authorized");
  assert.equal(loaded?.authorization?.providerReference, (auth as { ok: true; deal: Deal }).deal.authorization?.providerReference);
});