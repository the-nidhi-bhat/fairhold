import assert from "node:assert/strict";
import test from "node:test";
import { isFinalPaymentOutcome, planCapture } from "./capture-state.ts";

test("partial capture cannot exceed remaining authorization", () => {
  assert.deepEqual(planCapture(10000, 4000, 3000), {
    allowed: true,
    remainingCents: 6000,
    captureCents: 3000,
    finalCapture: false,
  });
  assert.equal(planCapture(10000, 4000, 7000).allowed, false);
});

test("capture equal to remaining authorization is final", () => {
  assert.equal(planCapture(10000, 4000, 6000).finalCapture, true);
});

test("a fully captured authorization cannot be captured again", () => {
  const plan = planCapture(10000, 10000, 5000);
  assert.equal(plan.allowed, false);
  assert.match(plan.error ?? "", /no remaining amount/i);
  // Over-capture is still rejected even when the request itself is invalid.
  assert.equal(planCapture(10000, 12000, 0).allowed, false);
});

test("only confirmed completion is final", () => {
  assert.equal(isFinalPaymentOutcome("COMPLETED", true), true);
  assert.equal(isFinalPaymentOutcome("COMPLETED", false), false);
  assert.equal(isFinalPaymentOutcome("PENDING", true), false);
  assert.equal(isFinalPaymentOutcome("FAILED", true), false);
  assert.equal(isFinalPaymentOutcome("VOIDED", true), false);
});

test("sequential captures track remaining amount correctly", () => {
  const first = planCapture(10000, 0, 4000); // $40 of $100, $100 remains
  assert.equal(first.allowed, true);
  assert.equal(first.remainingCents, 10000);
  assert.equal(first.captureCents, 4000);
  assert.equal(first.finalCapture, false);

  const second = planCapture(10000, 4000, 3000); // $30 more, $60 remains
  assert.equal(second.allowed, true);
  assert.equal(second.remainingCents, 6000);
  assert.equal(second.captureCents, 3000);
  assert.equal(second.finalCapture, false);

  const third = planCapture(10000, 7000, 4000); // Try $40, only $30 remains
  assert.equal(third.allowed, false);
  assert.match(third.error ?? "", /exceeds/i);
});

test("concurrent captures: second is rejected when authorization is exhausted", () => {
  // First capture takes most of the authorization
  const first = planCapture(10000, 0, 6000); // $60 of $100
  assert.equal(first.allowed, true);

  // Second capture sees updated state: only $40 remains
  const second = planCapture(10000, 6000, 6000); // Try another $60
  assert.equal(second.allowed, false);
  assert.match(second.error ?? "", /exceeds/i);
});

test("zero authorization is never payable", () => {
  const plan = planCapture(0, 0, 1000);
  assert.equal(plan.allowed, false);
  assert.match(plan.error ?? "", /invalid authorization amount/i);
});

test("negative capture amount is rejected", () => {
  const plan = planCapture(10000, 0, -500);
  assert.equal(plan.allowed, false);
  assert.match(plan.error ?? "", /invalid capture amount/i);
});
