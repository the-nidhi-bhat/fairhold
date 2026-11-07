import assert from "node:assert/strict";
import test from "node:test";
import {
  createDemoState,
  demoMoney,
  demoReducer,
  type DemoState,
} from "./reducer.ts";
import {
  DEMO_BUILD_MILESTONE_ID,
  DEMO_DESIGN_MILESTONE_ID,
  DEMO_EVIDENCE_ID,
} from "./fixture.ts";

function as(state: DemoState, role: DemoState["role"]): DemoState {
  return demoReducer(state, { type: "set-role", role });
}

function run(state: DemoState, ...steps: Parameters<typeof demoReducer>[1][]) {
  return steps.reduce((current, action) => demoReducer(current, action), state);
}

test("the fixture starts unauthorized with one pending submission", () => {
  const state = createDemoState(new Date("2026-05-01T00:00:00.000Z"));
  assert.equal(state.deal.authorization, null);
  assert.equal(state.deal.status, "Ready for Authorization");
  assert.equal(state.deal.evidence[0]?.decision, "pending");
  assert.equal(state.role, "buyer");
});

test("only the buyer can place the simulated hold", () => {
  const sellerView = as(createDemoState(), "seller");
  const refused = demoReducer(sellerView, { type: "authorize" });
  assert.match(refused.lastError ?? "", /only the buyer/i);
  assert.equal(refused.deal.authorization, null);

  const authorized = demoReducer(createDemoState(), { type: "authorize" });
  assert.equal(authorized.lastError, null);
  assert.equal(authorized.deal.status, "Authorized");
  assert.equal(authorized.deal.authorization?.simulated, true);
  assert.equal(authorized.deal.authorization?.amountCents, 200_000);
  assert.match(authorized.deal.authorization?.providerReference ?? "", /^demo-auth-/);
});

test("a superseded authorization is refused instead of double-holding", () => {
  const once = demoReducer(createDemoState(), { type: "authorize" });
  const twice = demoReducer(once, { type: "authorize" });
  assert.match(twice.lastError ?? "", /already has an authorization/i);
  assert.equal(twice.deal.authorization?.amountCents, 200_000);
});

test("the full happy path: authorize, accept, approve, simulated capture", () => {
  const state = run(
    createDemoState(),
    { type: "authorize" },
    { type: "review-evidence", evidenceId: DEMO_EVIDENCE_ID, decision: "accepted", note: "Looks complete." },
  );

  const accepted = state.deal.evidence.find((entry) => entry.id === DEMO_EVIDENCE_ID);
  assert.equal(accepted?.decision, "accepted");

  const approved = demoReducer(state, {
    type: "approve-milestone",
    milestoneId: DEMO_DESIGN_MILESTONE_ID,
    note: "Approved.",
  });

  assert.equal(approved.lastError, null);
  const milestone = approved.deal.milestones.find(
    (entry) => entry.id === DEMO_DESIGN_MILESTONE_ID,
  );
  assert.equal(milestone?.status, "Completed");
  assert.equal(milestone?.approval?.action, "CAPTURE");
  assert.equal(milestone?.approval?.paymentStatus, "COMPLETED");
  assert.equal(milestone?.approval?.simulated, true);
  assert.match(milestone?.approval?.providerReference ?? "", /^demo-capture-/);
  assert.equal(milestone?.approval?.reviewedBy, "buyer:Alex Buyer");

  const money = demoMoney(approved);
  assert.equal(money.authorizedCents, 200_000);
  assert.equal(money.capturedCents, 120_000);
  assert.equal(money.remainingCents, 80_000);
  assert.equal(money.fullyCaptured, false);
});

test("approving before any evidence is submitted is refused", () => {
  const state = demoReducer(createDemoState(), { type: "authorize" });
  const refused = demoReducer(state, {
    type: "approve-milestone",
    milestoneId: DEMO_BUILD_MILESTONE_ID,
    note: "",
  });
  assert.match(refused.lastError ?? "", /not allowed|hold|evidence/i);
  assert.equal(
    refused.deal.milestones.find((entry) => entry.id === DEMO_BUILD_MILESTONE_ID)
      ?.approval,
    null,
  );
});

test("requesting a revision blocks approval until new evidence arrives", () => {
  const state = run(
    createDemoState(),
    { type: "authorize" },
    {
      type: "review-evidence",
      evidenceId: DEMO_EVIDENCE_ID,
      decision: "rejected",
      note: "Navigation states are missing.",
    },
  );
  assert.equal(
    state.deal.evidence.find((entry) => entry.id === DEMO_EVIDENCE_ID)?.decision,
    "rejected",
  );

  const refused = demoReducer(state, {
    type: "approve-milestone",
    milestoneId: DEMO_DESIGN_MILESTONE_ID,
    note: "",
  });
  assert.match(refused.lastError ?? "", /not allowed|cannot be approved/i);
  assert.equal(refused.deal.milestones[0]?.approval, null);

  const resubmitted = demoReducer(as(state, "seller"), {
    type: "submit-evidence",
    milestoneId: DEMO_DESIGN_MILESTONE_ID,
    note: "Added all navigation states and focus styles.",
    url: "",
  });
  assert.equal(resubmitted.lastError, null);
  assert.equal(resubmitted.deal.evidence.length, 2);

  const reviewed = demoReducer(as(resubmitted, "buyer"), {
    type: "review-evidence",
    evidenceId: resubmitted.deal.evidence[1]!.id,
    decision: "accepted",
    note: "Thanks.",
  });
  const approved = demoReducer(reviewed, {
    type: "approve-milestone",
    milestoneId: DEMO_DESIGN_MILESTONE_ID,
    note: "",
  });
  assert.equal(approved.lastError, null);
  assert.equal(
    approved.deal.milestones.find((entry) => entry.id === DEMO_DESIGN_MILESTONE_ID)
      ?.status,
    "Completed",
  );
});

test("evidence needs a note or a valid link", () => {
  const sellerView = as(createDemoState(), "seller");
  const empty = demoReducer(sellerView, {
    type: "submit-evidence",
    milestoneId: DEMO_BUILD_MILESTONE_ID,
    note: "   ",
    url: "javascript:alert(1)",
  });
  assert.match(empty.lastError ?? "", /note|link/i);
  assert.equal(empty.deal.evidence.length, 1);
});

test("milestones are frozen once the hold exists", () => {
  const authorized = demoReducer(createDemoState(), { type: "authorize" });
  const refused = demoReducer(as(authorized, "seller"), {
    type: "add-milestone",
    title: "Extra work",
    amountCents: 10_000,
    acceptanceCriteria: "A new deliverable that was not agreed.",
  });
  assert.match(refused.lastError ?? "", /fixed once/i);
});

test("a reviewer may never approve or review evidence", () => {
  const reviewer = as(createDemoState(), "reviewer");
  const approval = demoReducer(reviewer, {
    type: "approve-milestone",
    milestoneId: DEMO_DESIGN_MILESTONE_ID,
    note: "",
  });
  assert.match(approval.lastError ?? "", /only the buyer/i);

  const review = demoReducer(reviewer, {
    type: "review-evidence",
    evidenceId: DEMO_EVIDENCE_ID,
    decision: "accepted",
    note: "",
  });
  assert.match(review.lastError ?? "", /only the buyer/i);
});

test("reset restores the original scenario", () => {
  const changed = run(
    createDemoState(),
    { type: "authorize" },
    { type: "review-evidence", evidenceId: DEMO_EVIDENCE_ID, decision: "accepted", note: "ok" },
  );
  const reset = demoReducer(changed, { type: "reset" });
  assert.equal(reset.deal.authorization, null);
  assert.equal(reset.deal.evidence[0]?.decision, "pending");
  assert.equal(reset.revision, 0);
});
