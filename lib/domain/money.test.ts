import assert from "node:assert/strict";
import test from "node:test";
import { parseAmountToCents, summarizeDealMoney } from "./money.ts";
import type { Deal, Milestone } from "./types.ts";

function milestone(
  overrides: Partial<Milestone> & { amountCents: number },
): Milestone {
  return {
    id: "m-1",
    title: "Milestone",
    description: "Description",
    dueDate: null,
    acceptanceCriteria: "Criteria",
    status: "In Progress",
    approval: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function deal(overrides: Partial<Deal>): Pick<Deal, "authorization" | "milestones"> {
  return {
    authorization: null,
    milestones: [],
    ...overrides,
  };
}

function authorization(amountCents: number): Deal["authorization"] {
  return {
    providerName: "demo",
    providerReference: "sim-1",
    simulated: true,
    amountCents,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

test("no authorization means every bucket is zero", () => {
  const summary = summarizeDealMoney(
    deal({ milestones: [milestone({ amountCents: 10_000 })] }),
  );
  assert.equal(summary.hasAuthorization, false);
  assert.equal(summary.authorizedCents, 0);
  assert.equal(summary.capturedCents, 0);
  assert.equal(summary.remainingCents, 0);
  assert.equal(summary.fullyCaptured, false);
});

test("an authorized deal with no captures keeps the full balance", () => {
  const summary = summarizeDealMoney(
    deal({
      authorization: authorization(20_000),
      milestones: [milestone({ amountCents: 12_000 })],
    }),
  );
  assert.equal(summary.authorizedCents, 20_000);
  assert.equal(summary.capturedCents, 0);
  assert.equal(summary.pendingCents, 0);
  assert.equal(summary.remainingCents, 20_000);
});

test("a confirmed capture reduces the remaining balance", () => {
  const summary = summarizeDealMoney(
    deal({
      authorization: authorization(20_000),
      milestones: [
        milestone({
          amountCents: 12_000,
          approval: {
            id: "a-1",
            decision: "approve",
            action: "CAPTURE",
            reasonCodes: [],
            explanation: "Accepted",
            evidenceFingerprint: "fp",
            evidenceReviewedCount: 1,
            reviewedBy: "buyer:Alex Buyer",
            reviewedAt: "2026-01-02T00:00:00.000Z",
            providerReference: "CAP-1",
            providerName: "paypal",
            simulated: false,
            paymentStatus: "COMPLETED",
            note: null,
          },
        }),
      ],
    }),
  );
  assert.equal(summary.capturedCents, 12_000);
  assert.equal(summary.remainingCents, 8_000);
  assert.equal(summary.fullyCaptured, false);
});

test("a pending capture is unsettled, not captured, and still reserved", () => {
  const summary = summarizeDealMoney(
    deal({
      authorization: authorization(20_000),
      milestones: [
        milestone({
          amountCents: 5_000,
          approval: {
            id: "a-1",
            decision: "approve",
            action: "CAPTURE",
            reasonCodes: [],
            explanation: "Accepted",
            evidenceFingerprint: "fp",
            evidenceReviewedCount: 1,
            reviewedBy: "buyer:Alex Buyer",
            reviewedAt: "2026-01-02T00:00:00.000Z",
            providerReference: null,
            providerName: "paypal",
            simulated: false,
            paymentStatus: "PENDING",
            note: null,
          },
        }),
      ],
    }),
  );
  assert.equal(summary.capturedCents, 0);
  assert.equal(summary.pendingCents, 5_000);
  assert.equal(summary.remainingCents, 15_000);
});

test("a failed capture moved no money and does not reduce the balance", () => {
  const summary = summarizeDealMoney(
    deal({
      authorization: authorization(20_000),
      milestones: [
        milestone({
          amountCents: 5_000,
          approval: {
            id: "a-1",
            decision: "approve",
            action: "CAPTURE",
            reasonCodes: [],
            explanation: "Accepted",
            evidenceFingerprint: "fp",
            evidenceReviewedCount: 1,
            reviewedBy: "buyer:Alex Buyer",
            reviewedAt: "2026-01-02T00:00:00.000Z",
            providerReference: null,
            providerName: "paypal",
            simulated: false,
            paymentStatus: "FAILED",
            note: null,
          },
        }),
      ],
    }),
  );
  assert.equal(summary.capturedCents, 0);
  assert.equal(summary.pendingCents, 0);
  assert.equal(summary.remainingCents, 20_000);
});

test("a voided authorization releases the remainder and leaves zero available", () => {
  const summary = summarizeDealMoney(
    deal({
      authorization: authorization(20_000),
      milestones: [
        milestone({
          amountCents: 4_000,
          approval: {
            id: "a-1",
            decision: "approve",
            action: "VOID",
            reasonCodes: ["DEAL_CANCELLED"],
            explanation: "Cancelled",
            evidenceFingerprint: "fp",
            evidenceReviewedCount: 0,
            reviewedBy: "buyer:Alex Buyer",
            reviewedAt: "2026-01-02T00:00:00.000Z",
            providerReference: "VOID-1",
            providerName: "paypal",
            simulated: false,
            paymentStatus: "VOIDED",
            note: null,
          },
        }),
      ],
    }),
  );
  assert.equal(summary.capturedCents, 0);
  assert.equal(summary.releasedCents, 20_000);
  assert.equal(summary.remainingCents, 0);
});

test("the summary never reports a negative balance or over-captured state", () => {
  const summary = summarizeDealMoney(
    deal({
      authorization: authorization(10_000),
      milestones: [
        milestone({
          amountCents: 12_000,
          approval: {
            id: "a-1",
            decision: "approve",
            action: "CAPTURE",
            reasonCodes: [],
            explanation: "Accepted",
            evidenceFingerprint: "fp",
            evidenceReviewedCount: 1,
            reviewedBy: "buyer:Alex Buyer",
            reviewedAt: "2026-01-02T00:00:00.000Z",
            providerReference: "CAP-1",
            providerName: "paypal",
            simulated: false,
            paymentStatus: "COMPLETED",
            note: null,
          },
        }),
      ],
    }),
  );
  assert.equal(summary.capturedCents, 12_000);
  assert.equal(summary.remainingCents, 0);
  assert.equal(summary.fullyCaptured, false);
});

test("parseAmountToCents keeps exact decimal precision", () => {
  assert.deepEqual(parseAmountToCents("1200"), { ok: true, value: 120_000 });
  assert.deepEqual(parseAmountToCents("1200.5"), { ok: true, value: 120_050 });
  assert.deepEqual(parseAmountToCents("0.07"), { ok: true, value: 7 });
  assert.deepEqual(parseAmountToCents(" 19.99 "), { ok: true, value: 1_999 });
  assert.deepEqual(parseAmountToCents("$42.10"), { ok: true, value: 4_210 });
});

test("parseAmountToCents rejects ambiguous or invalid input", () => {
  assert.equal(parseAmountToCents("").ok, false);
  assert.equal(parseAmountToCents("0").ok, false);
  assert.equal(parseAmountToCents("-5").ok, false);
  assert.equal(parseAmountToCents("1.234").ok, false);
  assert.equal(parseAmountToCents("1,200").ok, false);
  assert.equal(parseAmountToCents("abc").ok, false);
  assert.equal(parseAmountToCents("1e6").ok, false);
});
