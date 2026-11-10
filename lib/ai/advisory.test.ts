import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicAgreementAnalysis,
  deterministicEvidenceAdvisory,
  deterministicEvidenceAnalysis,
  deterministicMilestoneProposal,
  analyzeAgreement,
  analyzeEvidence,
  parseAgreementAnalysis,
  parseEvidenceAdvisory,
  parseEvidenceAnalysis,
  parseMilestoneProposal,
  readAdvisoryProviderConfig,
  resolveEvidenceAdvisory,
  resolveMilestoneProposal,
} from "./advisory.ts";
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

function geminiResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*  Existing: milestone proposal                                              */
/* -------------------------------------------------------------------------- */

test("configured AI milestone advisory uses provider output and validates it", async () => {
  let requestBody = "";
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return geminiResponse(JSON.stringify({
      title: "Provider milestone",
      description: "Provider-generated description",
      acceptanceCriteria: "Clear provider acceptance criteria",
    }));
  }) as typeof fetch;

  const result = await resolveMilestoneProposal("Build it", {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "ai");
  assert.equal(result.proposal.title, "Provider milestone");

  // The request must use Gemini format (contents + parts), not OpenAI messages.
  assert.match(requestBody, /contents/);
  assert.match(requestBody, /parts/);
  assert.doesNotMatch(requestBody, /"messages"/);
});

test("AI milestone advisory falls back when provider output is invalid", async () => {
  const fetchImpl = (async () =>
    geminiResponse("not json")) as typeof fetch;

  const result = await resolveMilestoneProposal("Build it", {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "deterministic");
  assert.equal(result.proposal.title, "Deliver agreed work");
});

test("AI milestone advisory falls back when no provider configured", async () => {
  const result = await resolveMilestoneProposal("Build a website", {});
  assert.equal(result.source, "deterministic");
  assert.equal(result.proposal.title, "Deliver agreed work");
});

test("provider URL is used verbatim when it has no {model} placeholder", () => {
  const config = readAdvisoryProviderConfig({
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    GEMINI_API_URL: "https://example.test/custom-generate",
  });
  assert.equal(config?.url, "https://example.test/custom-generate");
});

test("provider URL substitutes and percent-encodes {model}", () => {
  const config = readAdvisoryProviderConfig({
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "gemini 3.5/pro",
    GEMINI_API_URL: "https://example.test/v1beta/models/{model}:generateContent",
  });
  assert.equal(
    config?.url,
    "https://example.test/v1beta/models/gemini%203.5%2Fpro:generateContent",
  );
});

test("provider URL override must use https or loopback http", () => {
  const rejected = readAdvisoryProviderConfig({
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
    GEMINI_API_URL: "http://evil.example/v1beta/models/{model}:generateContent",
  });
  assert.equal(rejected, null);

  const localhost = readAdvisoryProviderConfig({
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
    GEMINI_API_URL: "http://localhost:8080/v1beta/models/{model}:generateContent",
  });
  assert.equal(
    localhost?.url,
    "http://localhost:8080/v1beta/models/test-model:generateContent",
  );

  const loopback = readAdvisoryProviderConfig({
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
    GEMINI_API_URL: "http://127.0.0.1:8080/generate",
  });
  assert.equal(loopback?.url, "http://127.0.0.1:8080/generate");

  const malformed = readAdvisoryProviderConfig({
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
    GEMINI_API_URL: "not a url",
  });
  assert.equal(malformed, null);
});

/* -------------------------------------------------------------------------- */
/*  Existing: evidence advisory                                               */
/* -------------------------------------------------------------------------- */

test("AI evidence advisory falls back safely when provider output is invalid", async () => {
  const fetchImpl = (async () =>
    geminiResponse('{"summary":"bad"}')) as typeof fetch;

  const result = await resolveEvidenceAdvisory("Ship code", ["code file"], {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "deterministic");
  assert.equal(Array.isArray(result.advisory.concerns), true);
});

test("AI evidence advisory uses a valid structured provider response", async () => {
  let requestBody = "";
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return geminiResponse(JSON.stringify({
      summary: "The submitted file matches the acceptance criteria.",
      matchedCriteria: ["Deliverable is provided"],
      concerns: [],
    }));
  }) as typeof fetch;

  const result = await resolveEvidenceAdvisory("Deliverable is provided", ["delivery.pdf"], {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);

  assert.equal(result.source, "ai");
  assert.deepEqual(result.advisory.matchedCriteria, ["Deliverable is provided"]);
  assert.match(requestBody, /matchedCriteria/);
  assert.doesNotMatch(requestBody, /recommended/);
});

test("AI evidence advisory falls back when provider returns non-200", async () => {
  const fetchImpl = (async () =>
    new Response("error", { status: 500 })) as typeof fetch;

  const result = await resolveEvidenceAdvisory("Ship code", ["code file"], {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "deterministic");
});

/* -------------------------------------------------------------------------- */
/*  Existing: parsers                                                         */
/* -------------------------------------------------------------------------- */

test("AI output parsers reject incomplete structures", () => {
  assert.equal(parseMilestoneProposal({ title: "Incomplete" }), null);
  assert.equal(parseEvidenceAdvisory({ summary: "Missing arrays" }), null);
});

test("AI output parsers coerce arrays and accept valid structures", () => {
  assert.deepEqual(
    parseEvidenceAdvisory({
      summary: "Evidence reviewed.",
      matchedCriteria: ["Criterion A"],
      concerns: [],
    }),
    {
      summary: "Evidence reviewed.",
      matchedCriteria: ["Criterion A"],
      concerns: [],
    },
  );
});

test("AI output parsers accept bounded structured proposals", () => {
  assert.deepEqual(
    parseMilestoneProposal({
      title: "Delivery",
      description: "Build the agreed product.",
      acceptanceCriteria: "Buyer accepts the delivery.",
    }),
    {
      title: "Delivery",
      description: "Build the agreed product.",
      acceptanceCriteria: "Buyer accepts the delivery.",
    },
  );
});

/* -------------------------------------------------------------------------- */
/*  Existing: deterministic fallbacks                                         */
/* -------------------------------------------------------------------------- */

test("deterministic fallback remains available for AI failures", () => {
  assert.match(deterministicMilestoneProposal("Build and deliver a website.").title, /Deliver|milestone/i);
  assert.equal(
    deterministicEvidenceAdvisory("Approved website", []).concerns[0],
    "Evidence is missing.",
  );
});

test("deterministic evidence advisory never matches criteria without shared tokens", () => {
  const criteria =
    "Responsive layouts at 375px\nSource files delivered\nAccessibility audit completed";
  const result = deterministicEvidenceAdvisory(criteria, ["wip"]);

  assert.equal(result.matchedCriteria.length, 0);
  assert.ok(result.concerns.length > 0);
});

test("deterministic evidence advisory matches only criteria with shared keywords", () => {
  const criteria = "Responsive layouts at 375px\nSource files delivered";
  const result = deterministicEvidenceAdvisory(criteria, [
    "Source files are in the shared repository.",
  ]);

  assert.deepEqual(result.matchedCriteria, ["Source files delivered"]);
  assert.ok(result.concerns.some((concern) => concern.includes("Responsive")));
});

test("deterministic evidence advisory reports no matches for an empty draft", () => {
  const criteria = "Responsive layouts at 375px\nSource files delivered";
  const result = deterministicEvidenceAdvisory(criteria, []);

  assert.deepEqual(result.matchedCriteria, []);
  assert.ok(result.concerns.length > 0);
});

test("deterministic evidence advisory requires multiple token matches for multi-token criteria", () => {
  const criteria = "Responsive layouts at 375px\nSource files delivered";
  // Evidence mentions "responsive" but not "layouts" or "375px" — only one
  // meaningful token matches, which is insufficient for a multi-token criterion.
  const result = deterministicEvidenceAdvisory(criteria, [
    "The site is responsive on all devices.",
  ]);
  assert.deepEqual(result.matchedCriteria, []);
  assert.ok(result.concerns.some((c) => c.includes("Responsive layouts")));
  assert.ok(result.concerns.some((c) => c.includes("Source files")));
});

/* -------------------------------------------------------------------------- */
/*  New: agreement analysis                                                   */
/* -------------------------------------------------------------------------- */

test("deterministic agreement analysis extracts deliverables and gaps", () => {
  const result = deterministicAgreementAnalysis(
    "Build a marketing website with a design system. Deliver buttons, forms and cards. " +
    "Acceptance: responsive at 375px/768px/1440px. $5,000 due by Friday.",
  );
  assert.ok(result.deliverables.length > 0);
  assert.ok(result.acceptanceCriteria.length > 0);
  assert.ok(Array.isArray(result.missingDetails));
  assert.ok(Array.isArray(result.ambiguousRequirements));
  assert.ok(Number.isInteger(result.estimatedMilestones));
  assert.ok(result.estimatedMilestones >= 1 && result.estimatedMilestones <= 5);
});

test("deterministic agreement analysis flags missing details", () => {
  const result = deterministicAgreementAnalysis("Do some work.");
  assert.ok(result.missingDetails.length > 0);
  assert.ok(result.ambiguousRequirements.length > 0);
});

test("deterministic agreement analysis detects plain-currency amounts", () => {
  const result = deterministicAgreementAnalysis(
    "Build a website. Acceptance criteria: responsive at 375px. 1200 USD due by Friday.",
  );

  assert.ok(
    !result.missingDetails.some((detail) => detail.includes("payment amount")),
  );
});

test("parseAgreementAnalysis rejects incomplete structures", () => {
  assert.equal(parseAgreementAnalysis({ deliverables: [] }), null);
  assert.equal(parseAgreementAnalysis({ estimatedMilestones: "five" }), null);
  assert.equal(parseAgreementAnalysis(null), null);
});

test("parseAgreementAnalysis accepts bounded structured analysis", () => {
  const result = parseAgreementAnalysis({
    deliverables: ["Marketing website", "Design system"],
    acceptanceCriteria: ["Responsive at 375px/768px/1440px"],
    missingDetails: ["No payment amount specified"],
    ambiguousRequirements: ["Vague timing language"],
    estimatedMilestones: 3,
  });
  assert.deepEqual(result?.deliverables, ["Marketing website", "Design system"]);
  assert.equal(result?.estimatedMilestones, 3);
});

test("AI analyzeAgreement uses provider output and validates it", async () => {
  const fetchImpl = (async () =>
    geminiResponse(JSON.stringify({
      deliverables: ["Website redesign"],
      acceptanceCriteria: ["Responsive layouts"],
      missingDetails: ["No deadline specified"],
      ambiguousRequirements: ["Vague scope"],
      estimatedMilestones: 2,
    }))) as typeof fetch;

  const result = await analyzeAgreement("Build a website.", {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "ai");
  assert.deepEqual(result.analysis.deliverables, ["Website redesign"]);
  assert.equal(result.analysis.estimatedMilestones, 2);
});

test("AI analyzeAgreement falls back when provider unavailable", async () => {
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  const result = await analyzeAgreement("Build a website.", {
    GEMINI_API_KEY: "test-key",
    GEMINI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "deterministic");
});

/* -------------------------------------------------------------------------- */
/*  New: evidence intelligence                                                */
/* -------------------------------------------------------------------------- */

test("deterministic evidence analysis maps evidence to criteria", () => {
  const result = deterministicEvidenceAnalysis(
    ["Responsive layouts at 375px/768px/1440px", "Source files delivered"],
    ["The site is responsive on mobile, tablet and desktop. Source files are in the shared folder."],
  );
  assert.ok(result.supportedCriteria.length > 0);
  assert.ok(Array.isArray(result.missingCriteria));
  assert.ok(Array.isArray(result.contradictoryEvidence));
  assert.ok(Array.isArray(result.insufficientEvidence));
  assert.ok(typeof result.reasoning === "string");
  assert.ok(Array.isArray(result.limitations));
  assert.ok(result.limitations.some((l) => l.includes("human reviewer")));
});

test("deterministic evidence analysis handles no evidence", () => {
  const result = deterministicEvidenceAnalysis(["Criterion A"], []);
  assert.equal(result.evidenceCount, 0);
  assert.ok(result.insufficientEvidence.length > 0);
  assert.ok(result.reasoning.includes("No evidence was submitted"));
});

test("parseEvidenceAnalysis rejects incomplete structures", () => {
  assert.equal(parseEvidenceAnalysis({ evidenceCount: 0 }), null);
  assert.equal(parseEvidenceAnalysis({ reasoning: "ok" }), null);
  assert.equal(parseEvidenceAnalysis(null), null);
});

test("parseEvidenceAnalysis accepts bounded structured analysis", () => {
  const result = parseEvidenceAnalysis({
    evidenceCount: 2,
    supportedCriteria: ["Criterion A"],
    missingCriteria: ["Criterion B"],
    contradictoryEvidence: [],
    insufficientEvidence: [],
    reasoning: "Two submissions evaluated.",
    limitations: ["Keyword-only matching"],
  });
  assert.equal(result?.evidenceCount, 2);
  assert.deepEqual(result?.supportedCriteria, ["Criterion A"]);
  assert.deepEqual(result?.missingCriteria, ["Criterion B"]);
});

test("parseEvidenceAnalysis coerces string evidenceCount to number", () => {
  const result = parseEvidenceAnalysis({
    evidenceCount: "3",
    supportedCriteria: ["Criterion A"],
    missingCriteria: [],
    contradictoryEvidence: [],
    insufficientEvidence: [],
    reasoning: "Three submissions evaluated.",
    limitations: ["Keyword-only matching"],
  });
  assert.equal(result?.evidenceCount, 3);
});

test("parseEvidenceAnalysis rejects non-numeric evidenceCount", () => {
  const result = parseEvidenceAnalysis({
    evidenceCount: "not-a-number",
    supportedCriteria: [],
    missingCriteria: [],
    contradictoryEvidence: [],
    insufficientEvidence: [],
    reasoning: "ok",
    limitations: [],
  });
  assert.equal(result, null);
});

test("AI analyzeEvidence uses provider output and validates it", async () => {
  const fetchImpl = (async () =>
    geminiResponse(JSON.stringify({
      evidenceCount: 1,
      supportedCriteria: ["Deliverable matches criteria"],
      missingCriteria: [],
      contradictoryEvidence: [],
      insufficientEvidence: [],
      reasoning: "Evidence supports all stated criteria.",
      limitations: ["Keyword-only matching"],
    }))) as typeof fetch;

  const result = await analyzeEvidence(
    ["Deliverable matches criteria"],
    ["delivery.pdf"],
    { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    fetchImpl,
  );
  assert.equal(result.source, "ai");
  assert.deepEqual(result.analysis.supportedCriteria, ["Deliverable matches criteria"]);
});

test("AI analyzeEvidence falls back when provider returns malformed JSON", async () => {
  const fetchImpl = (async () =>
    geminiResponse("not json")) as typeof fetch;

  const result = await analyzeEvidence(
    ["Criterion A"],
    ["evidence"],
    { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
    fetchImpl,
  );
  assert.equal(result.source, "deterministic");
});

/* -------------------------------------------------------------------------- */
/*  Advisory-only enforcement                                                 */
/* -------------------------------------------------------------------------- */

test("advisory: AI cannot approve evidence, authorize payment, or execute capture", async () => {
  const fetchImpl = (async () =>
    geminiResponse(JSON.stringify({
      summary: "Evidence looks complete.",
      matchedCriteria: ["All criteria met"],
      concerns: [],
    }))) as typeof fetch;
  const result = await resolveEvidenceAdvisory(
    "Deliverable is provided",
    ["file.pdf"],
    { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "test-model" },
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
});
