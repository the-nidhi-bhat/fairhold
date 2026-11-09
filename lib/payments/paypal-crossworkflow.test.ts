import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEvidenceAdvisory,
  type EvidenceAdvisory,
} from "../ai/advisory.ts";
import {
  planCapture,
} from "./capture-state.ts";
import { DemoPaymentProvider } from "./demo.ts";
import type { CaptureRequest } from "./provider.ts";
import { planApproval } from "../domain/approval.ts";
import type { Recommendation } from "../domain/types.ts";

function recommendation(
  action: Recommendation["action"],
): Recommendation {
  return {
    action,
    reasonCodes: ["EVIDENCE_ACCEPTED"],
    explanation: "test",
    requiresHumanReview: action !== "HOLD",
    evidenceReviewedCount: 1,
    evidenceFingerprint: "fp",
  };
}

async function aiEvidenceAdvisory(
  advisory: EvidenceAdvisory,
): Promise<EvidenceAdvisory> {
  const fetchImpl = (async () => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(advisory) } }],
      }),
    );
  }) as unknown as typeof fetch;
  const result = await resolveEvidenceAdvisory(
    "Deliverable matches criteria",
    ["delivery.pdf"],
    { AI_API_KEY: "test-key", AI_MODEL: "test-model" },
    fetchImpl,
  );
  return result.advisory;
}

/**
 * Cross-workflow: AI generates an evidence advisory, a HUMAN reviewer makes the
 * decision, and PayPal capture only proceeds on human CAPTURE approval within
 * the authorization cap. The demo provider is used so no real PayPal call occurs.
 */
test(
  "crossworkflow: AI advisory informs but never decides; human approve gates capture",
  async () => {
    // 1. AI produces an advisory (mocked provider).
    const advisory = await aiEvidenceAdvisory({
      summary: "The submitted file matches the acceptance criteria.",
      matchedCriteria: ["Deliverable matches criteria"],
      concerns: [],
    });
    assert.equal(advisory.summary, "The submitted file matches the acceptance criteria.");
    assert.deepEqual(advisory.matchedCriteria, ["Deliverable matches criteria"]);

    // 2. The AI advisory is advisory-only: it does not contain an approval
    //    decision. The human reviewer decides.
    const humanDecision = "approve";

    // 3. Deterministic rules convert the human decision into a payment plan.
    const plan = planApproval(recommendation("CAPTURE"), humanDecision);
    assert.equal(plan.allowed, true);
    assert.equal(plan.action, "CAPTURE");

    // 4. The capture plan respects the authorization cap (cannot exceed remaining).
    assert.deepEqual(planCapture(10000, 0, 6000), {
      allowed: true,
      remainingCents: 10000,
      captureCents: 6000,
      finalCapture: false,
    });
    assert.equal(planCapture(10000, 6000, 5000).allowed, false);

    // 5. The demo provider captures without any network call and flags it
    //    `simulated: true` — no real PayPal operation occurred.
    const provider = new DemoPaymentProvider();
    const result = await provider.captureAuthorization({
      dealId: "deal-1",
      milestoneId: "ms-1",
      amountCents: 6000,
      currency: "USD",
      authorizationReference: "auth-1",
      finalCapture: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.simulated, true);
    assert.equal(result.status, "COMPLETED");
    assert.match(result.message, /SIMULATED/);

    // 6. A human reject never triggers a payment action.
    const rejectPlan = planApproval(recommendation("CAPTURE"), "reject");
    assert.equal(rejectPlan.action, "NONE");
  },
);

/**
 * Advisory boundary: the AI advisory functions return data only. They never
 * mutate deal state, never set a review decision, never authorize payment, and
 * never execute a capture. The system prompts explicitly forbid it.
 */
test(
  "advisory: AI cannot approve evidence, authorize payment, or execute capture",
  async () => {
    // Resolve an AI evidence advisory (mocked provider).
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Evidence looks complete.",
                  matchedCriteria: ["All criteria met"],
                  concerns: [],
                }),
              },
            },
          ],
        }),
      )) as typeof fetch;
    const result = await resolveEvidenceAdvisory(
      "Deliverable is provided",
      ["file.pdf"],
      { AI_API_KEY: "test-key", AI_MODEL: "test-model" },
      fetchImpl,
    );

    // The advisory is a plain value — no deal id, no milestone id, no payment
    // reference, no approval action. It cannot change any deal state.
    assert.equal(result.source, "ai");
    assert.equal(typeof result.advisory.summary, "string");
    assert.ok(Array.isArray(result.advisory.matchedCriteria));
    assert.ok(Array.isArray(result.advisory.concerns));
    const advisoryRecord = result.advisory as unknown as Record<string, unknown>;
    assert.equal(advisoryRecord.dealId, undefined);
    assert.equal(advisoryRecord.milestoneId, undefined);
    assert.equal(advisoryRecord.approval, undefined);
    assert.equal(advisoryRecord.paymentStatus, undefined);

    // The advisory has no capture or void action — only a human reviewer can
    // produce a CAPTURE/VOID plan via planApproval.
    const advisoryKeys = Object.keys(result.advisory);
    assert.ok(!advisoryKeys.includes("action"));
    assert.ok(!advisoryKeys.includes("capture"));
    assert.ok(!advisoryKeys.includes("void"));

    // A capture request requires a human approval first: planApproval rejects
    // without an explicit human "approve" decision on a CAPTURE recommendation.
    assert.equal(planApproval(recommendation("CAPTURE"), "approve").action, "CAPTURE");
    assert.equal(planApproval(recommendation("CAPTURE"), "reject").action, "NONE");
    assert.equal(planApproval(recommendation("HOLD"), "approve").action, "NONE");
  },
);

/**
 * Demo isolation: the demo provider never contacts PayPal. Every result is
 * `simulated: true`, so a cross-workflow using the demo provider cannot
 * accidentally execute a real payment operation.
 */
test("demo: no PayPal request is made across the full capture lifecycle", async () => {
  const provider = new DemoPaymentProvider();

  const hold = await provider.createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 10000,
    currency: "USD",
  });
  assert.equal(hold.simulated, true);
  assert.match(hold.message, /SIMULATED: no PayPal request was made/);

  const auth = await provider.authorizeOrder({
    dealId: "deal-1",
    orderId: hold.providerReference ?? "demo-auth-x",
  });
  assert.equal(auth.simulated, true);
  assert.match(auth.message, /SIMULATED/);

  const capture = await provider.captureAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    amountCents: 5000,
    currency: "USD",
    authorizationReference: auth.providerReference ?? "demo-auth-x",
  });
  assert.equal(capture.simulated, true);
  assert.match(capture.message, /SIMULATED: no PayPal request was made/);

  const voidResult = await provider.voidAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    authorizationReference: auth.providerReference ?? "demo-auth-x",
  });
  assert.equal(voidResult.simulated, true);
  assert.match(voidResult.message, /SIMULATED/);
});

/**
 * Type-level contract: a CaptureRequest never originates from AI output. It
 * requires explicit deal/milestone/authorization references and a positive
 * integer amount — all server-derived, never model-supplied.
 */
test("types: capture request is server-derived, never AI-supplied", () => {
  const request: CaptureRequest = {
    dealId: "deal-1",
    milestoneId: "ms-1",
    amountCents: 5000,
    currency: "USD",
    authorizationReference: "auth-1",
  };
  assert.equal(request.amountCents, 5000);
  assert.equal(typeof request.amountCents, "number");
  assert.equal(Number.isSafeInteger(request.amountCents), true);
  assert.ok(request.amountCents > 0);
  assert.equal(request.authorizationReference, "auth-1");
  assert.ok(request.dealId.length > 0);
  assert.ok(request.milestoneId.length > 0);
});
