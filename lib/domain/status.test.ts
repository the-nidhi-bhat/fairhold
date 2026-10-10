import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedManualDealTransitions,
  canTransitionDeal,
  canTransitionMilestone,
  computeProgress,
  paymentStatusFor,
} from "./status.ts";
import type { Milestone } from "./types.ts";

function milestone(
  partial: Partial<Milestone> & Pick<Milestone, "amountCents" | "status">,
): Milestone {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    title: "Milestone",
    description: "",
    dueDate: null,
    acceptanceCriteria: "Done.",
    approval: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("deal transitions: only legal moves are allowed", () => {
  assert.equal(canTransitionDeal("Draft", "Awaiting Agreement"), true);
  assert.equal(canTransitionDeal("Draft", "Completed"), false);
  assert.equal(canTransitionDeal("Cancelled", "Draft"), false);
});

test("deal transitions: Authorized is never a manual transition", () => {
  assert.equal(
    allowedManualDealTransitions("Ready for Authorization").includes(
      "Authorized",
    ),
    false,
  );
});

test("milestone transitions: only legal moves are allowed", () => {
  assert.equal(canTransitionMilestone("In Progress", "Awaiting Review"), true);
  assert.equal(canTransitionMilestone("Draft", "Completed"), false);
});

test("computeProgress: counts completed milestones and sums cents", () => {
  const progress = computeProgress({
    milestones: [
      milestone({ amountCents: 1000, status: "Completed" }),
      milestone({ amountCents: 2000, status: "Draft" }),
    ],
  });
  assert.deepEqual(progress, {
    total: 2,
    completed: 1,
    percent: 50,
    totalCents: 3000,
    completedCents: 1000,
  });
});

test("computeProgress: empty deal is 0%", () => {
  const progress = computeProgress({ milestones: [] });
  assert.equal(progress.total, 0);
  assert.equal(progress.percent, 0);
});

test("paymentStatusFor: pre-authorization deals are not authorized", () => {
  assert.equal(
    paymentStatusFor({ status: "Draft", authorization: null, pendingAuthorization: null })
      .key,
    "not_authorized",
  );
  assert.equal(
    paymentStatusFor({
      status: "Ready for Authorization",
      authorization: null,
      pendingAuthorization: null,
    }).key,
    "not_authorized",
  );
});

test("paymentStatusFor: a created order awaiting approval is pending, not authorized", () => {
  const info = paymentStatusFor({
    status: "Ready for Authorization",
    authorization: null,
    pendingAuthorization: {
      providerName: "paypal-sandbox",
      mode: "sandbox",
      providerOrderId: "ORDER-1",
      approvalUrl: "https://example.test/approve",
      amountCents: 1000,
      currency: "USD",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert.equal(info.key, "authorization_pending");
  assert.equal(info.tone, "warning");
});

test("paymentStatusFor: simulated authorizations are labelled simulated", () => {
  const info = paymentStatusFor({
    status: "Authorized",
    authorization: {
      providerName: "demo-payment-provider",
      providerReference: "demo-auth-1",
      simulated: true,
      amountCents: 1000,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    pendingAuthorization: null,
  });
  assert.equal(info.key, "authorization_simulated");
  assert.equal(info.tone, "warning");
  assert.match(info.label, /simulated/i);
});

test("paymentStatusFor: real sandbox authorizations are labelled sandbox", () => {
  const info = paymentStatusFor({
    status: "Authorized",
    authorization: {
      providerName: "paypal-sandbox",
      providerReference: "AUTH-1",
      providerOrderId: "ORDER-1",
      simulated: false,
      amountCents: 1000,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    pendingAuthorization: null,
  });
  assert.equal(info.key, "authorization_sandbox");
  assert.equal(info.tone, "success");
  assert.match(info.label, /sandbox/i);
  assert.doesNotMatch(info.detail, /settled|captured/i);
});

test("paymentStatusFor: cancelled deals show no payment", () => {
  assert.equal(
    paymentStatusFor({
      status: "Cancelled",
      authorization: null,
      pendingAuthorization: null,
    }).key,
    "no_payment",
  );
});
