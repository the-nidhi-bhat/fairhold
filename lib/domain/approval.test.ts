import { test } from "node:test";
import assert from "node:assert/strict";
import { isApprovalDecision, planApproval } from "./approval.ts";
import type { Recommendation, RecommendationAction } from "./types.ts";

function recommendation(action: RecommendationAction): Recommendation {
  return {
    action,
    reasonCodes: ["EVIDENCE_ACCEPTED"],
    explanation: "test",
    requiresHumanReview: action !== "HOLD",
    evidenceReviewedCount: 1,
    evidenceFingerprint: "fp",
  };
}

test("approve + CAPTURE is allowed and yields a CAPTURE action", () => {
  const plan = planApproval(recommendation("CAPTURE"), "approve");
  assert.equal(plan.allowed, true);
  assert.equal(plan.action, "CAPTURE");
  assert.equal(plan.error, null);
});

test("approve + VOID is allowed and yields a VOID action", () => {
  const plan = planApproval(recommendation("VOID"), "approve");
  assert.equal(plan.allowed, true);
  assert.equal(plan.action, "VOID");
});

test("approve is refused for HOLD and DISPUTE recommendations", () => {
  for (const action of ["HOLD", "DISPUTE"] as const) {
    const plan = planApproval(recommendation(action), "approve");
    assert.equal(plan.allowed, false);
    assert.equal(plan.action, "NONE");
    assert.ok(plan.error);
  }
});

test("reject is always allowed and never triggers a payment action", () => {
  for (const action of ["CAPTURE", "HOLD", "VOID", "DISPUTE"] as const) {
    const plan = planApproval(recommendation(action), "reject");
    assert.equal(plan.allowed, true);
    assert.equal(plan.action, "NONE");
  }
});

test("isApprovalDecision guards the decision value", () => {
  assert.equal(isApprovalDecision("approve"), true);
  assert.equal(isApprovalDecision("reject"), true);
  assert.equal(isApprovalDecision("authorized"), false);
  assert.equal(isApprovalDecision(""), false);
});
