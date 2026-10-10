import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDealForImport } from "./importValidate.ts";
import type { Deal } from "../domain/types.ts";

function validDeal(): Deal {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Build a landing page",
    agreement: "Freelancer builds a landing page for the client.",
    clientName: "Client Co",
    freelancerName: "Freelancer LLC",
    currency: "USD",
    status: "Draft",
    authorization: null,
    pendingAuthorization: null,
    evidence: [],
    milestones: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Design review",
        description: "Share the design for review.",
        amountCents: 50000,
        dueDate: "2026-12-01",
        acceptanceCriteria: "Client approves the design.",
        status: "In Progress",
        approval: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    events: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        type: "deal.created",
        message: "Deal created.",
        actor: "system",
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

test("valid deal imports cleanly", () => {
  const result = validateDealForImport(validDeal());
  assert.equal(result.ok, true, result.issues.join("; "));
});

test("non-object input is rejected", () => {
  assert.equal(validateDealForImport(null).ok, false);
  assert.equal(validateDealForImport("deal").ok, false);
  assert.equal(validateDealForImport([]).ok, false);
});

test("post-authorization status without an authorization record is rejected", () => {
  const deal = validDeal();
  deal.status = "Authorized";
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /requires an authorization record/);
});

test("pre-authorization status holding an authorization record is rejected", () => {
  const deal = validDeal();
  deal.status = "Draft";
  deal.authorization = {
    providerName: "demo-payment-provider",
    providerReference: "demo-auth-1",
    simulated: true,
    amountCents: 50000,
    createdAt: new Date().toISOString(),
  };
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /cannot have an authorization record/);
});

test("pending authorization outside Ready for Authorization is rejected", () => {
  const deal = validDeal();
  deal.status = "Draft";
  deal.pendingAuthorization = {
    providerName: "paypal-sandbox",
    mode: "sandbox",
    providerOrderId: "ORDER-1",
    approvalUrl: null,
    amountCents: 50000,
    currency: "USD",
    createdAt: new Date().toISOString(),
  };
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /pending authorization/);
});

test("pending and authorized records at the same time are rejected", () => {
  const deal = validDeal();
  deal.status = "Ready for Authorization";
  deal.pendingAuthorization = {
    providerName: "paypal-sandbox",
    mode: "sandbox",
    providerOrderId: "ORDER-1",
    approvalUrl: null,
    amountCents: 50000,
    currency: "USD",
    createdAt: new Date().toISOString(),
  };
  deal.authorization = {
    providerName: "paypal-sandbox",
    providerReference: "AUTH-1",
    providerOrderId: "ORDER-1",
    simulated: false,
    amountCents: 50000,
    createdAt: new Date().toISOString(),
  };
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(" "), /cannot have both/);
});

test("authorization without a provider reference is rejected (untraceable hold)", () => {
  const deal = validDeal();
  deal.status = "Authorized";
  deal.authorization = {
    providerName: "paypal-sandbox",
    providerReference: null,
    simulated: false,
    amountCents: 50000,
    createdAt: new Date().toISOString(),
  };
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(" "), /providerReference/);
});

test("fractional cents in authorization are rejected", () => {
  const deal = validDeal();
  deal.status = "Authorized";
  deal.authorization = {
    providerName: "paypal-sandbox",
    providerReference: "AUTH-1",
    simulated: false,
    amountCents: 500.5,
    createdAt: new Date().toISOString(),
  };
  assert.equal(validateDealForImport(deal).ok, false);
});

test("unknown deal status is rejected", () => {
  const deal = validDeal();
  (deal as unknown as { status: string }).status = "Hibernating";
  assert.equal(validateDealForImport(deal).ok, false);
});

test("non-USD currency is rejected", () => {
  const deal = validDeal();
  deal.currency = "EUR";
  assert.equal(validateDealForImport(deal).ok, false);
});

test("reviewed evidence without reviewedAt is rejected", () => {
  const deal = validDeal();
  deal.evidence.push({
    id: "44444444-4444-4444-8444-444444444444",
    milestoneId: deal.milestones[0].id,
    note: "Screenshots attached.",
    url: null,
    file: null,
    submittedAt: new Date().toISOString(),
    submittedBy: "system",
    decision: "accepted",
    reviewedAt: null,
    reviewNote: null,
  });
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(" "), /reviewedAt/);
});

test("zero-amount milestone is rejected", () => {
  const deal = validDeal();
  deal.milestones[0].amountCents = 0;
  assert.equal(validateDealForImport(deal).ok, false);
});

test("unknown event type is rejected", () => {
  const deal = validDeal();
  (deal.events[0] as unknown as { type: string }).type = "galaxy.exploded";
  assert.equal(validateDealForImport(deal).ok, false);
});

test("all problems are reported together, not just the first", () => {
  const deal = validDeal();
  deal.status = "Authorized"; // missing authorization
  deal.currency = "EUR";
  deal.milestones[0].amountCents = -5;
  const result = validateDealForImport(deal);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length >= 3, `expected >=3 issues, got ${result.issues.length}`);
});