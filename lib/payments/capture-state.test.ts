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
