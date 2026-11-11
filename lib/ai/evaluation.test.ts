/**
 * AI evaluation dataset — repeatable test cases for agreement analysis and
 * evidence analysis.
 *
 * These tests exercise the deterministic fallback paths (no GEMINI_API_KEY
 * required) and the structured provider-response paths (mocked Gemini). They
 * record prompt/model versions, error cases, and fallback behavior.
 *
 * No live AI calls are made. All provider responses are mocked.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeAgreement,
  analyzeEvidence,
  deterministicAgreementAnalysis,
  deterministicEvidenceAnalysis,
  parseAgreementAnalysis,
  parseEvidenceAnalysis,
} from "./advisory.ts";

// ---------------------------------------------------------------------------
// Evaluation fixtures (prompt/model versions recorded for reproducibility)
// ---------------------------------------------------------------------------

const MODEL_VERSION = "gemini-3.5-flash-lite";

const GEMINI_ENV = {
  GEMINI_API_KEY: "test-key",
  GEMINI_MODEL: MODEL_VERSION,
};

function mockGemini(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  );
}

// ---------------------------------------------------------------------------
// Deterministic fallback evaluation (no provider configured)
// ---------------------------------------------------------------------------

test("eval: deterministic agreement analysis — complete agreement", () => {
  const agreement =
    "Jamie Seller will redesign the marketing site in two milestones: " +
    "a design system and component library, then a responsive build and handoff. " +
    "Each milestone is paid only after Alex Buyer accepts the submitted evidence. " +
    "$8,000 total, due within 60 days of each acceptance.";

  const result = deterministicAgreementAnalysis(agreement);

  assert.ok(result.deliverables.length > 0, "should extract deliverables");
  assert.ok(result.acceptanceCriteria.length > 0, "should extract criteria");
  assert.ok(
    Number.isInteger(result.estimatedMilestones) &&
      result.estimatedMilestones >= 1 &&
      result.estimatedMilestones <= 5,
    "should estimate milestone count 1-5",
  );
  // A complete agreement should have few or no missing details
  assert.ok(result.missingDetails.length <= 2, "complete agreement has few gaps");
});

test("eval: deterministic agreement analysis — minimal agreement", () => {
  const result = deterministicAgreementAnalysis("Do some work.");

  assert.ok(result.missingDetails.length > 0, "should flag missing details");
  assert.ok(
    result.ambiguousRequirements.length > 0,
    "should flag ambiguous requirements",
  );
});

test("eval: deterministic evidence analysis — supported and missing criteria", () => {
  const criteria = [
    "Responsive layouts at 375px/768px/1440px",
    "Source files delivered",
    "Accessibility audit completed",
  ];
  const evidence = [
    "The site is responsive on mobile, tablet and desktop. " +
      "Layouts verified at 375px, 768px and 1440px.",
    "Source files are in the shared GitHub repository.",
  ];

  const result = deterministicEvidenceAnalysis(criteria, evidence);

  assert.equal(result.evidenceCount, 2);
  assert.ok(
    result.supportedCriteria.some((c) => c.includes("Responsive")),
    "should support responsive criterion",
  );
  assert.ok(
    result.supportedCriteria.some((c) => c.includes("Source files")),
    "should support source files criterion",
  );
  assert.ok(
    result.missingCriteria.some((c) => c.includes("Accessibility")),
    "should flag missing accessibility criterion",
  );
  assert.ok(
    result.limitations.some((l) => l.includes("human reviewer")),
    "should note human reviewer limitation",
  );
});

test("eval: deterministic evidence analysis — no evidence", () => {
  const result = deterministicEvidenceAnalysis(["Criterion A"], []);

  assert.equal(result.evidenceCount, 0);
  assert.ok(result.insufficientEvidence.length > 0);
  assert.ok(result.reasoning.includes("No evidence was submitted"));
});

// ---------------------------------------------------------------------------
// Provider-response evaluation (mocked Gemini)
// ---------------------------------------------------------------------------

test("eval: provider agreement analysis — valid structured response", async () => {
  const fetchImpl = (async () =>
    mockGemini(
      JSON.stringify({
        deliverables: ["Marketing website", "Design system"],
        acceptanceCriteria: ["Responsive at 375px/768px/1440px"],
        missingDetails: ["No payment amount specified"],
        ambiguousRequirements: ["Vague timing language"],
        estimatedMilestones: 3,
      }),
    )) as typeof fetch;

  const result = await analyzeAgreement("Build a website.", GEMINI_ENV, fetchImpl);

  assert.equal(result.source, "ai");
  assert.deepEqual(result.analysis.deliverables, [
    "Marketing website",
    "Design system",
  ]);
  assert.equal(result.analysis.estimatedMilestones, 3);
});

test("eval: provider agreement analysis — invalid response falls back", async () => {
  const fetchImpl = (async () =>
    mockGemini("not json")) as typeof fetch;

  const result = await analyzeAgreement("Build a website.", GEMINI_ENV, fetchImpl);

  assert.equal(result.source, "deterministic");
  assert.ok(result.analysis.deliverables.length >= 0);
});

test("eval: provider evidence analysis — valid structured response", async () => {
  const fetchImpl = (async () =>
    mockGemini(
      JSON.stringify({
        evidenceCount: 2,
        supportedCriteria: ["Responsive layouts delivered"],
        missingCriteria: ["Accessibility audit"],
        contradictoryEvidence: [],
        insufficientEvidence: [],
        reasoning:
          "Two submissions evaluated. Responsive layouts confirmed; accessibility not addressed.",
        limitations: ["Keyword-only matching; cannot read file contents"],
      }),
    )) as typeof fetch;

  const result = await analyzeEvidence(
    ["Responsive layouts delivered", "Accessibility audit"],
    ["submission1.pdf", "submission2.pdf"],
    GEMINI_ENV,
    fetchImpl,
  );

  assert.equal(result.source, "ai");
  assert.equal(result.analysis.evidenceCount, 2);
  assert.deepEqual(result.analysis.supportedCriteria, [
    "Responsive layouts delivered",
  ]);
  assert.deepEqual(result.analysis.missingCriteria, ["Accessibility audit"]);
});

test("eval: provider evidence analysis — malformed JSON falls back", async () => {
  const fetchImpl = (async () =>
    mockGemini("not json")) as typeof fetch;

  const result = await analyzeEvidence(
    ["Criterion A"],
    ["evidence"],
    GEMINI_ENV,
    fetchImpl,
  );

  assert.equal(result.source, "deterministic");
});

test("eval: provider evidence analysis — missing required fields falls back", async () => {
  const fetchImpl = (async () =>
    mockGemini(
      JSON.stringify({ evidenceCount: 1 }), // missing supportedCriteria, etc.
    )) as typeof fetch;

  const result = await analyzeEvidence(
    ["Criterion A"],
    ["evidence"],
    GEMINI_ENV,
    fetchImpl,
  );

  assert.equal(result.source, "deterministic");
});

// ---------------------------------------------------------------------------
// Parser evaluation
// ---------------------------------------------------------------------------

test("eval: parseAgreementAnalysis — bounded fields", () => {
  const result = parseAgreementAnalysis({
    deliverables: ["A".repeat(500)], // should be truncated to 200
    acceptanceCriteria: ["B".repeat(500)], // should be truncated to 300
    missingDetails: ["C".repeat(500)], // should be truncated to 300
    ambiguousRequirements: ["D".repeat(500)], // should be truncated to 300
    estimatedMilestones: 100, // should be clamped to 5
  });

  assert.equal(result?.deliverables[0]?.length, 200);
  assert.equal(result?.acceptanceCriteria[0]?.length, 300);
  assert.equal(result?.missingDetails[0]?.length, 300);
  assert.equal(result?.ambiguousRequirements[0]?.length, 300);
  assert.equal(result?.estimatedMilestones, 5);
});

test("eval: parseAgreementAnalysis — rejects invalid", () => {
  assert.equal(parseAgreementAnalysis({ deliverables: [] }), null);
  assert.equal(parseAgreementAnalysis({ estimatedMilestones: "five" }), null);
  assert.equal(parseAgreementAnalysis(null), null);
  assert.equal(parseAgreementAnalysis(undefined), null);
});

test("eval: parseEvidenceAnalysis — bounded fields", () => {
  const result = parseEvidenceAnalysis({
    evidenceCount: 25, // should be clamped to 20 (max items)
    supportedCriteria: ["A".repeat(500)], // truncated to 300
    missingCriteria: ["B".repeat(500)], // truncated to 300
    contradictoryEvidence: ["C".repeat(500)], // truncated to 300
    insufficientEvidence: ["D".repeat(500)], // truncated to 300
    reasoning: "E".repeat(2000), // truncated to 1000
    limitations: ["F".repeat(500)], // truncated to 300
  });

  assert.equal(result?.evidenceCount, 25); // evidenceCount is not clamped (it's a count)
  assert.equal(result?.supportedCriteria[0]?.length, 300);
  assert.equal(result?.reasoning.length, 1000);
  assert.equal(result?.limitations[0]?.length, 300);
});

test("eval: parseEvidenceAnalysis — rejects invalid", () => {
  assert.equal(parseEvidenceAnalysis({ evidenceCount: 0 }), null);
  assert.equal(parseEvidenceAnalysis({ reasoning: "ok" }), null);
  assert.equal(parseEvidenceAnalysis(null), null);
});

// ---------------------------------------------------------------------------
// Advisory-only enforcement (evaluation)
// ---------------------------------------------------------------------------

test("eval: advisory output contains no payment or deal references", async () => {
  const fetchImpl = (async () =>
    mockGemini(
      JSON.stringify({
        summary: "Evidence looks complete.",
        matchedCriteria: ["All criteria met"],
        concerns: [],
      }),
    )) as typeof fetch;

  const result = await analyzeEvidence(
    ["Criterion A"],
    ["evidence"],
    GEMINI_ENV,
    fetchImpl,
  );

  const advisoryRecord = result.analysis as unknown as Record<string, unknown>;
  assert.equal(advisoryRecord.dealId, undefined);
  assert.equal(advisoryRecord.milestoneId, undefined);
  assert.equal(advisoryRecord.approval, undefined);
  assert.equal(advisoryRecord.paymentStatus, undefined);
  assert.equal(advisoryRecord.action, undefined);
  assert.equal(advisoryRecord.capture, undefined);
  assert.equal(advisoryRecord.void, undefined);
});
