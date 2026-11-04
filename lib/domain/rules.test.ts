import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvalIsStale,
  evidenceFingerprint,
  recommendMilestone,
} from "./rules.ts";
import type {
  EvidenceSubmission,
  Milestone,
  MilestoneApproval,
} from "./types.ts";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const AUTHORIZED = { status: "Authorized" as const };

function milestone(partial: Partial<Milestone> = {}): Milestone {
  return {
    id: "ms-1",
    title: "Milestone",
    description: "",
    amountCents: 1000,
    dueDate: null,
    acceptanceCriteria: "Ship it.",
    status: "Awaiting Review",
    approval: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function evidence(
  partial: Partial<EvidenceSubmission> = {},
): EvidenceSubmission {
  return {
    id: "ev-1",
    milestoneId: "ms-1",
    note: "done",
    url: null,
    file: null,
    submittedAt: "2026-02-01T00:00:00.000Z",
    submittedBy: "system",
    decision: "pending",
    reviewedAt: null,
    reviewNote: null,
    ...partial,
  };
}

function approval(partial: Partial<MilestoneApproval> = {}): MilestoneApproval {
  return {
    id: "ap-1",
    decision: "approve",
    action: "CAPTURE",
    reasonCodes: ["EVIDENCE_ACCEPTED"],
    explanation: "ok",
    evidenceFingerprint: evidenceFingerprint([evidence({ decision: "accepted" })]),
    evidenceReviewedCount: 1,
    reviewedBy: "system",
    reviewedAt: "2026-02-02T00:00:00.000Z",
    providerReference: "demo-capture-1",
    providerName: "demo-payment-provider",
    simulated: true,
    note: null,
    ...partial,
  };
}

test("no evidence -> HOLD EVIDENCE_MISSING", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone(),
    evidence: [],
    now: NOW,
  });
  assert.equal(rec.action, "HOLD");
  assert.deepEqual(rec.reasonCodes, ["EVIDENCE_MISSING"]);
});

test("pending evidence -> HOLD EVIDENCE_PENDING_REVIEW", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone(),
    evidence: [evidence()],
    now: NOW,
  });
  assert.equal(rec.action, "HOLD");
  assert.ok(rec.reasonCodes.includes("EVIDENCE_PENDING_REVIEW"));
  assert.equal(rec.requiresHumanReview, false);
});

test("accepted evidence -> CAPTURE with attestation reason", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone(),
    evidence: [evidence({ decision: "accepted" })],
    now: NOW,
  });
  assert.equal(rec.action, "CAPTURE");
  assert.ok(rec.reasonCodes.includes("EVIDENCE_ACCEPTED"));
  assert.ok(rec.reasonCodes.includes("EVIDENCE_NOT_MACHINE_CHECKABLE"));
  assert.equal(rec.requiresHumanReview, true);
});

test("accepted evidence with a met deadline -> CAPTURE DEADLINE_MET", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone({ dueDate: "2026-06-10" }),
    evidence: [evidence({ decision: "accepted" })],
    now: NOW,
  });
  assert.equal(rec.action, "CAPTURE");
  assert.ok(rec.reasonCodes.includes("DEADLINE_MET"));
});

test("overdue milestone -> HOLD DEADLINE_PASSED", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone({ dueDate: "2026-05-01" }),
    evidence: [evidence({ decision: "accepted" })],
    now: NOW,
  });
  assert.equal(rec.action, "HOLD");
  assert.deepEqual(rec.reasonCodes, ["DEADLINE_PASSED"]);
});

test("rejected evidence -> DISPUTE", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone(),
    evidence: [evidence({ decision: "rejected" })],
    now: NOW,
  });
  assert.equal(rec.action, "DISPUTE");
  assert.deepEqual(rec.reasonCodes, ["EVIDENCE_REJECTED"]);
});

test("a newer accepted submission resolves an earlier rejection", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone(),
    evidence: [
      evidence({
        id: "ev-rejected",
        decision: "rejected",
        submittedAt: "2026-02-01T00:00:00.000Z",
      }),
      evidence({
        id: "ev-accepted",
        decision: "accepted",
        submittedAt: "2026-02-03T00:00:00.000Z",
      }),
    ],
    now: NOW,
  });
  assert.equal(rec.action, "CAPTURE");
  assert.ok(rec.reasonCodes.includes("EVIDENCE_ACCEPTED"));
  assert.ok(!rec.reasonCodes.includes("EVIDENCE_REJECTED"));
});

test("a rejection newer than the accepted submission still blocks", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone(),
    evidence: [
      evidence({
        id: "ev-accepted",
        decision: "accepted",
        submittedAt: "2026-02-01T00:00:00.000Z",
      }),
      evidence({
        id: "ev-rejected",
        decision: "rejected",
        submittedAt: "2026-02-03T00:00:00.000Z",
      }),
    ],
    now: NOW,
  });
  assert.equal(rec.action, "DISPUTE");
  assert.deepEqual(rec.reasonCodes, ["EVIDENCE_REJECTED"]);
});

test("deal not authorized -> HOLD DEAL_NOT_AUTHORIZED", () => {
  const rec = recommendMilestone({
    deal: { status: "Draft" },
    milestone: milestone(),
    evidence: [evidence({ decision: "accepted" })],
    now: NOW,
  });
  assert.equal(rec.action, "HOLD");
  assert.ok(rec.reasonCodes.includes("DEAL_NOT_AUTHORIZED"));
});

test("disputed milestone -> DISPUTE", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone({ status: "Disputed" }),
    evidence: [],
    now: NOW,
  });
  assert.equal(rec.action, "DISPUTE");
  assert.deepEqual(rec.reasonCodes, ["MILESTONE_DISPUTED"]);
});

test("cancelled milestone -> VOID", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone({ status: "Cancelled" }),
    evidence: [],
    now: NOW,
  });
  assert.equal(rec.action, "VOID");
  assert.deepEqual(rec.reasonCodes, ["MILESTONE_CANCELLED"]);
});

test("cancelled deal -> VOID", () => {
  const rec = recommendMilestone({
    deal: { status: "Cancelled" },
    milestone: milestone(),
    evidence: [],
    now: NOW,
  });
  assert.equal(rec.action, "VOID");
  assert.deepEqual(rec.reasonCodes, ["DEAL_CANCELLED"]);
});

test("already processed milestone -> HOLD ALREADY_PROCESSED", () => {
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone({ approval: approval(), status: "Awaiting Review" }),
    evidence: [evidence({ decision: "accepted" })],
    now: NOW,
  });
  assert.equal(rec.action, "HOLD");
  assert.deepEqual(rec.reasonCodes, ["ALREADY_PROCESSED"]);
});

test("a stale approval does not block a fresh recommendation", () => {
  const stale = approval({ evidenceFingerprint: "stale-fingerprint" });
  const rec = recommendMilestone({
    deal: AUTHORIZED,
    milestone: milestone({ approval: stale, status: "Awaiting Review" }),
    evidence: [evidence({ decision: "accepted" })],
    now: NOW,
  });
  assert.equal(rec.action, "CAPTURE");
});

test("evidenceFingerprint is order-independent and decision-sensitive", () => {
  const a = evidence({ id: "a", decision: "accepted" });
  const b = evidence({ id: "b", decision: "pending" });
  assert.equal(evidenceFingerprint([a, b]), evidenceFingerprint([b, a]));

  const changed = evidence({ id: "b", decision: "rejected" });
  assert.notEqual(evidenceFingerprint([a, b]), evidenceFingerprint([a, changed]));
});

test("approvalIsStale compares the reviewed evidence fingerprint", () => {
  const reviewed = [evidence({ decision: "accepted" })];
  const current = approval({ evidenceFingerprint: evidenceFingerprint(reviewed) });
  assert.equal(approvalIsStale(current, reviewed), false);
  assert.equal(
    approvalIsStale(current, [...reviewed, evidence({ id: "extra" })]),
    true,
  );
  assert.equal(approvalIsStale(null, reviewed), false);
});
