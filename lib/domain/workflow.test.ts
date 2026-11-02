import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "./types.ts";
import { summarizeDashboardWorkflow } from "./workflow.ts";

function deal(): Deal {
  return {
    id: "deal-1",
    title: "Website delivery",
    agreement: "Build the agreed website.",
    clientName: "Alex Buyer",
    freelancerName: "Jamie Seller",
    currency: "USD",
    status: "In Progress",
    authorization: null,
    pendingAuthorization: null,
    evidence: [
      {
        id: "pending-evidence",
        milestoneId: "milestone-1",
        note: "Ready for review",
        url: null,
        file: null,
        submittedAt: "2026-11-02T10:00:00.000Z",
        submittedBy: "Jamie Seller",
        decision: "pending",
        reviewedAt: null,
        reviewNote: null,
      },
      {
        id: "rejected-evidence",
        milestoneId: "milestone-2",
        note: "Needs correction",
        url: null,
        file: null,
        submittedAt: "2026-11-02T09:00:00.000Z",
        submittedBy: "Jamie Seller",
        decision: "rejected",
        reviewedAt: "2026-11-02T09:30:00.000Z",
        reviewNote: "Add the missing state",
      },
    ],
    milestones: [
      {
        id: "milestone-1",
        title: "Homepage",
        description: "",
        amountCents: 10000,
        dueDate: "2026-11-05",
        acceptanceCriteria: "Homepage complete",
        status: "Awaiting Review",
        approval: null,
        createdAt: "2026-11-01T10:00:00.000Z",
        updatedAt: "2026-11-01T10:00:00.000Z",
      },
      {
        id: "milestone-2",
        title: "Mobile layout",
        description: "",
        amountCents: 5000,
        dueDate: null,
        acceptanceCriteria: "Responsive layout complete",
        status: "In Progress",
        approval: null,
        createdAt: "2026-11-01T10:00:00.000Z",
        updatedAt: "2026-11-01T10:00:00.000Z",
      },
    ],
    events: [],
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  };
}

test("buyer dashboard workflow finds persisted pending evidence", () => {
  const workflow = summarizeDashboardWorkflow([deal()], "buyer", "2026-11-02");
  assert.deepEqual(workflow.pendingReviews.map((item) => item.evidenceId), [
    "pending-evidence",
  ]);
});

test("seller dashboard workflow finds active milestones and rejected evidence", () => {
  const workflow = summarizeDashboardWorkflow([deal()], "seller", "2026-11-02");
  assert.deepEqual(
    workflow.assignedMilestones.map((item) => item.milestoneId),
    ["milestone-1", "milestone-2"],
  );
  assert.deepEqual(workflow.rejectedEvidence.map((item) => item.evidenceId), [
    "rejected-evidence",
  ]);
});
