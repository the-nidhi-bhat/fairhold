import assert from "node:assert/strict";
import test from "node:test";
import {
  advisoryForEvidenceDraft,
  analyzeAgreementDraft,
  analyzeDealEvidence,
  suggestMilestoneForDeal,
} from "./advisory-workflows.ts";
import type { DemoSession } from "../auth/session-token.ts";
import type { Deal } from "../domain/types.ts";

// Reviewer deal grants are read from the environment by canAccessDeal.
process.env.FAIRHOLD_DEMO_REVIEWERS = "morgan reviewer";
process.env.FAIRHOLD_REVIEWER_DEALS = "morgan reviewer:deal-1";

const buyer: DemoSession = { name: "Alex Buyer", role: "buyer" };
const seller: DemoSession = { name: "Jamie Seller", role: "seller" };
const reviewer: DemoSession = { name: "Morgan Reviewer", role: "reviewer" };

const ENV = {
  GEMINI_API_KEY: "super-secret-key-123",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
};

const VALID_AGREEMENT =
  "Build a marketing website with a responsive design system and handoff documentation.";

function geminiResponse(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
  );
}

const AGREEMENT_JSON = JSON.stringify({
  deliverables: ["Marketing website"],
  acceptanceCriteria: ["Responsive at 375px, 768px and 1440px"],
  missingDetails: [],
  ambiguousRequirements: [],
  estimatedMilestones: 2,
});

const MILESTONE_JSON = JSON.stringify({
  title: "Responsive build",
  description: "Build the responsive marketing site.",
  acceptanceCriteria: "Layouts verified at 375px, 768px and 1440px.",
});

const EVIDENCE_ANALYSIS_JSON = JSON.stringify({
  evidenceCount: 2,
  supportedCriteria: ["Responsive layouts at 375px, 768px, and 1440px"],
  missingCriteria: ["Source files delivered"],
  contradictoryEvidence: [],
  insufficientEvidence: [],
  reasoning: "Keyword overlap found supporting evidence.",
  limitations: ["Keyword-only matching"],
});

const EVIDENCE_ADVISORY_JSON = JSON.stringify({
  summary: "The draft mentions responsive layouts.",
  matchedCriteria: ["Responsive layouts at 375px, 768px, and 1440px"],
  concerns: [],
});

function countingFetch(factory: () => Response) {
  let calls = 0;
  const bodies: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body ?? ""));
    return factory();
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls, bodies };
}

function unexpectedFetch(): typeof fetch {
  return (async () => {
    throw new Error("provider fetch must not be called");
  }) as typeof fetch;
}

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "deal-1",
    title: "Website redesign",
    agreement:
      "UNIQUE-AGREEMENT-MARKER: build a marketing website with a responsive design system.",
    clientName: "Alex Buyer",
    freelancerName: "Jamie Seller",
    currency: "USD",
    status: "Awaiting Review",
    authorization: null,
    pendingAuthorization: null,
    evidence: [
      {
        id: "ev-1",
        milestoneId: "ms-1",
        note: "Responsive layouts at 375px, 768px, and 1440px.",
        url: "https://example.test/preview",
        file: null,
        submittedAt: "2026-01-02T00:00:00.000Z",
        submittedBy: "seller:Jamie Seller",
        decision: "pending",
        reviewedAt: null,
        reviewNote: null,
      },
      {
        id: "ev-2",
        milestoneId: "ms-1",
        note: "",
        url: null,
        file: {
          name: "delivery.pdf",
          size: 2048,
          type: "application/pdf",
          storedPath: "evidence/ev-2.pdf",
        },
        submittedAt: "2026-01-02T01:00:00.000Z",
        submittedBy: "seller:Jamie Seller",
        decision: "pending",
        reviewedAt: null,
        reviewNote: null,
      },
      {
        id: "ev-3",
        milestoneId: "ms-2",
        note: "Design tokens and source files delivered.",
        url: null,
        file: null,
        submittedAt: "2026-01-03T00:00:00.000Z",
        submittedBy: "seller:Jamie Seller",
        decision: "pending",
        reviewedAt: null,
        reviewNote: null,
      },
    ],
    milestones: [
      {
        id: "ms-1",
        title: "Responsive build",
        description: "Build the responsive site.",
        amountCents: 100_000,
        dueDate: null,
        acceptanceCriteria:
          "Responsive layouts at 375px, 768px, and 1440px\nSource files delivered",
        status: "Awaiting Review",
        approval: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "ms-2",
        title: "Handoff",
        description: "Hand off documentation.",
        amountCents: 50_000,
        dueDate: null,
        acceptanceCriteria: "Handoff documentation delivered",
        status: "In Progress",
        approval: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    events: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function userContent(body: string): { criteria: string[]; evidence: string[] } {
  const outer = JSON.parse(body) as {
    contents: Array<{ parts: Array<{ text: string }> }>;
  };
  return JSON.parse(outer.contents[0].parts[0].text) as {
    criteria: string[];
    evidence: string[];
  };
}

/* -------------------------------------------------------------------------- */
/*  Role authorization                                                        */
/* -------------------------------------------------------------------------- */

test("agreement draft allows buyer and seller but denies reviewer", async () => {
  for (const session of [buyer, seller]) {
    const outcome = await analyzeAgreementDraft(
      { session, agreement: VALID_AGREEMENT },
      { env: {} },
    );
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.source, "deterministic");
      assert.equal(outcome.label, "Deterministic advisory");
    }
  }

  const denied = await analyzeAgreementDraft(
    { session: reviewer, agreement: VALID_AGREEMENT },
    { env: ENV, fetchImpl: unexpectedFetch() },
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "forbidden");
});

test("milestone suggestion allows seller and reviewer but denies buyer", async () => {
  const deal = makeDeal();
  for (const session of [seller, reviewer]) {
    const outcome = await suggestMilestoneForDeal(
      { session, deal },
      { env: {} },
    );
    assert.equal(outcome.ok, true);
  }

  const denied = await suggestMilestoneForDeal(
    { session: buyer, deal },
    { env: ENV, fetchImpl: unexpectedFetch() },
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "forbidden");
});

test("evidence analysis allows buyer and reviewer but denies seller", async () => {
  const deal = makeDeal();
  for (const session of [buyer, reviewer]) {
    const outcome = await analyzeDealEvidence(
      { session, deal, milestoneId: "ms-1" },
      { env: {} },
    );
    assert.equal(outcome.ok, true);
  }

  const denied = await analyzeDealEvidence(
    { session: seller, deal, milestoneId: "ms-1" },
    { env: ENV, fetchImpl: unexpectedFetch() },
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "forbidden");
});

test("evidence draft advisory allows seller and reviewer but denies buyer", async () => {
  const deal = makeDeal();
  for (const session of [seller, reviewer]) {
    const outcome = await advisoryForEvidenceDraft(
      {
        session,
        deal,
        milestoneId: "ms-1",
        note: "Responsive layouts delivered at 375px.",
        url: "",
      },
      { env: {} },
    );
    assert.equal(outcome.ok, true);
  }

  const denied = await advisoryForEvidenceDraft(
    {
      session: buyer,
      deal,
      milestoneId: "ms-1",
      note: "Responsive layouts delivered at 375px.",
      url: "",
    },
    { env: ENV, fetchImpl: unexpectedFetch() },
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "forbidden");
});

/* -------------------------------------------------------------------------- */
/*  Cross-deal denial                                                         */
/* -------------------------------------------------------------------------- */

test("reviewer granted one deal is denied another deal", async () => {
  const otherDeal = makeDeal({ id: "deal-2" });
  const outcome = await suggestMilestoneForDeal(
    { session: reviewer, deal: otherDeal },
    { env: ENV, fetchImpl: unexpectedFetch() },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, "forbidden");
    assert.equal(outcome.error, "Deal not found or you do not have access.");
  }
});

test("buyer whose name does not match clientName is denied", async () => {
  const deal = makeDeal();
  const impostor: DemoSession = { name: "Someone Else", role: "buyer" };
  const outcome = await analyzeDealEvidence(
    { session: impostor, deal, milestoneId: "ms-1" },
    { env: ENV, fetchImpl: unexpectedFetch() },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "forbidden");
});

/* -------------------------------------------------------------------------- */
/*  Agreement workflow                                                        */
/* -------------------------------------------------------------------------- */

test("agreement workflow returns AI data and label when the provider answers", async () => {
  const stub = countingFetch(() => geminiResponse(AGREEMENT_JSON));
  const outcome = await analyzeAgreementDraft(
    { session: buyer, agreement: VALID_AGREEMENT },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.source, "ai");
    assert.equal(outcome.label, "AI advisory");
    assert.deepEqual(outcome.data.deliverables, ["Marketing website"]);
  }
  assert.equal(stub.calls(), 1);
});

test("agreement workflow falls back on provider 500, network throw and malformed JSON", async () => {
  const status500 = countingFetch(
    () => new Response("error", { status: 500 }),
  );
  const network = countingFetch(() => {
    throw new Error("network down");
  });
  const malformed = countingFetch(() => geminiResponse("not json"));

  for (const stub of [status500, network, malformed]) {
    const outcome = await analyzeAgreementDraft(
      { session: seller, agreement: VALID_AGREEMENT },
      { env: ENV, fetchImpl: stub.fetchImpl },
    );
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.source, "deterministic");
      assert.equal(outcome.label, "Deterministic advisory");
    }
    assert.equal(stub.calls(), 1);
  }
});

test("agreement workflow rejects out-of-bounds agreement text", async () => {
  const stub = countingFetch(() => geminiResponse(AGREEMENT_JSON));
  const tooShort = await analyzeAgreementDraft(
    { session: buyer, agreement: "1234567890123456789" },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  const tooLong = await analyzeAgreementDraft(
    { session: buyer, agreement: "a".repeat(20001) },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );

  assert.equal(tooShort.ok, false);
  if (!tooShort.ok) {
    assert.equal(tooShort.code, "invalid");
    assert.equal(tooShort.error, "Agreement must be at least 20 characters.");
  }
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) {
    assert.equal(tooLong.code, "invalid");
    assert.equal(tooLong.error, "Agreement is too long (20,000 character limit).");
  }
  assert.equal(stub.calls(), 0);
});

/* -------------------------------------------------------------------------- */
/*  Milestone suggestion                                                      */
/* -------------------------------------------------------------------------- */

test("milestone suggestion sends the stored deal agreement to the provider", async () => {
  const stub = countingFetch(() => geminiResponse(MILESTONE_JSON));
  const deal = makeDeal();
  const outcome = await suggestMilestoneForDeal(
    { session: seller, deal },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );

  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.source, "ai");
    assert.equal(outcome.label, "AI advisory");
    assert.equal(outcome.data.title, "Responsive build");
  }
  assert.equal(stub.calls(), 1);
  assert.match(stub.bodies[0], /UNIQUE-AGREEMENT-MARKER/);
});

test("milestone suggestion falls back deterministically when unconfigured", async () => {
  const outcome = await suggestMilestoneForDeal(
    { session: reviewer, deal: makeDeal() },
    { env: {} },
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.source, "deterministic");
    assert.equal(outcome.label, "Deterministic advisory");
  }
});

/* -------------------------------------------------------------------------- */
/*  Evidence analysis                                                         */
/* -------------------------------------------------------------------------- */

test("evidence analysis builds criteria and evidence from the stored deal", async () => {
  const stub = countingFetch(() => geminiResponse(EVIDENCE_ANALYSIS_JSON));
  const outcome = await analyzeDealEvidence(
    { session: buyer, deal: makeDeal(), milestoneId: "ms-1" },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );

  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.source, "ai");
    assert.equal(outcome.label, "AI advisory");
    assert.equal(outcome.data.evidenceCount, 2);
  }
  assert.equal(stub.calls(), 1);

  const payload = userContent(stub.bodies[0]);
  assert.deepEqual(payload.criteria, [
    "Responsive layouts at 375px, 768px, and 1440px",
    "Source files delivered",
  ]);
  assert.deepEqual(payload.evidence, [
    "Responsive layouts at 375px, 768px, and 1440px. https://example.test/preview",
    "delivery.pdf",
  ]);
});

test("evidence analysis returns not_found for an unknown milestone", async () => {
  const stub = countingFetch(() => geminiResponse(EVIDENCE_ANALYSIS_JSON));
  const outcome = await analyzeDealEvidence(
    { session: buyer, deal: makeDeal(), milestoneId: "missing" },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "not_found");
  assert.equal(stub.calls(), 0);
});

test("evidence analysis falls back deterministically when the provider fails", async () => {
  const stub = countingFetch(() => new Response("error", { status: 500 }));
  const outcome = await analyzeDealEvidence(
    { session: reviewer, deal: makeDeal(), milestoneId: "ms-1" },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.source, "deterministic");
    assert.equal(outcome.label, "Deterministic advisory");
  }
  assert.equal(stub.calls(), 1);
});

test("evidence analysis reports the server-derived evidence count, not the model's", async () => {
  const stub = countingFetch(() =>
    geminiResponse(
      JSON.stringify({
        ...JSON.parse(EVIDENCE_ANALYSIS_JSON),
        evidenceCount: 99,
      }),
    ),
  );
  const outcome = await analyzeDealEvidence(
    { session: buyer, deal: makeDeal(), milestoneId: "ms-1" },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );

  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.data.evidenceCount, 2);
});

test("evidence analysis discloses truncation when more than 20 evidence items exist", async () => {
  const evidence = Array.from({ length: 21 }, (_, index) => ({
    id: `ev-extra-${index}`,
    milestoneId: "ms-1",
    note: `Delivered work item ${index}.`,
    url: null,
    file: null,
    submittedAt: "2026-01-02T00:00:00.000Z",
    submittedBy: "seller:Jamie Seller",
    decision: "pending" as const,
    reviewedAt: null,
    reviewNote: null,
  }));

  const outcome = await analyzeDealEvidence(
    { session: buyer, deal: makeDeal({ evidence }), milestoneId: "ms-1" },
    { env: {} },
  );

  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.data.evidenceCount, 20);
    assert.ok(
      outcome.data.limitations.some((limitation) =>
        limitation.includes("Only the first 20 evidence items were assessed."),
      ),
    );
  }
});

/* -------------------------------------------------------------------------- */
/*  Evidence draft advisory                                                   */
/* -------------------------------------------------------------------------- */

test("evidence draft advisory rejects an empty draft without calling the provider", async () => {
  const stub = countingFetch(() => geminiResponse(EVIDENCE_ADVISORY_JSON));
  const outcome = await advisoryForEvidenceDraft(
    { session: seller, deal: makeDeal(), milestoneId: "ms-1", note: "", url: "" },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, "invalid");
    assert.equal(
      outcome.error,
      "Add a note or link to check a draft (files are not sent to the advisor).",
    );
  }
  assert.equal(stub.calls(), 0);
});

test("evidence draft advisory rejects an over-long note without calling the provider", async () => {
  const stub = countingFetch(() => geminiResponse(EVIDENCE_ADVISORY_JSON));
  const outcome = await advisoryForEvidenceDraft(
    {
      session: seller,
      deal: makeDeal(),
      milestoneId: "ms-1",
      note: "a".repeat(1001),
      url: "",
    },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, "invalid");
  assert.equal(stub.calls(), 0);
});

test("evidence draft advisory returns AI data and label on success", async () => {
  const stub = countingFetch(() => geminiResponse(EVIDENCE_ADVISORY_JSON));
  const outcome = await advisoryForEvidenceDraft(
    {
      session: seller,
      deal: makeDeal(),
      milestoneId: "ms-1",
      note: "Responsive layouts delivered at 375px.",
      url: "https://example.test/preview",
    },
    { env: ENV, fetchImpl: stub.fetchImpl },
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.source, "ai");
    assert.equal(outcome.label, "AI advisory");
    assert.equal(outcome.data.concerns.length, 0);
  }
  assert.equal(stub.calls(), 1);
});

/* -------------------------------------------------------------------------- */
/*  Safety properties                                                         */
/* -------------------------------------------------------------------------- */

test("advisory workflows do not mutate the deal or session", async () => {
  const deal = makeDeal();
  const dealClone = structuredClone(deal);
  const sessionClone = structuredClone(seller);

  await analyzeAgreementDraft(
    { session: seller, agreement: VALID_AGREEMENT },
    { env: {} },
  );
  await suggestMilestoneForDeal({ session: seller, deal }, { env: {} });
  await analyzeDealEvidence(
    { session: buyer, deal, milestoneId: "ms-1" },
    { env: {} },
  );
  await advisoryForEvidenceDraft(
    {
      session: seller,
      deal,
      milestoneId: "ms-1",
      note: "Responsive layouts delivered.",
      url: "",
    },
    { env: {} },
  );

  assert.deepEqual(deal, dealClone);
  assert.deepEqual(seller, sessionClone);
});

test("outcomes never expose the API key or the provider URL", async () => {
  const agreement = await analyzeAgreementDraft(
    { session: buyer, agreement: VALID_AGREEMENT },
    { env: ENV, fetchImpl: countingFetch(() => geminiResponse(AGREEMENT_JSON)).fetchImpl },
  );
  const milestone = await suggestMilestoneForDeal(
    { session: seller, deal: makeDeal() },
    { env: ENV, fetchImpl: countingFetch(() => geminiResponse(MILESTONE_JSON)).fetchImpl },
  );
  const evidence = await analyzeDealEvidence(
    { session: buyer, deal: makeDeal(), milestoneId: "ms-1" },
    {
      env: ENV,
      fetchImpl: countingFetch(() => geminiResponse(EVIDENCE_ANALYSIS_JSON)).fetchImpl,
    },
  );
  const draft = await advisoryForEvidenceDraft(
    {
      session: seller,
      deal: makeDeal(),
      milestoneId: "ms-1",
      note: "Responsive layouts delivered.",
      url: "",
    },
    {
      env: ENV,
      fetchImpl: countingFetch(() => geminiResponse(EVIDENCE_ADVISORY_JSON)).fetchImpl,
    },
  );

  for (const outcome of [agreement, milestone, evidence, draft]) {
    const serialized = JSON.stringify(outcome);
    assert.doesNotMatch(serialized, /super-secret-key-123/);
    assert.doesNotMatch(serialized, /generateContent/);
  }
});
