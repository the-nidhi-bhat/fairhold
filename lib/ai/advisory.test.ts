import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicEvidenceAdvisory,
  deterministicMilestoneProposal,
  parseEvidenceAdvisory,
  parseMilestoneProposal,
  resolveEvidenceAdvisory,
  resolveMilestoneProposal,
} from "./advisory.ts";

test("configured AI milestone advisory uses provider output and validates it", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        title: "Provider milestone",
        description: "Provider-generated description",
        acceptanceCriteria: "Clear provider acceptance criteria",
      }) } }],
    }))) as typeof fetch;
  const result = await resolveMilestoneProposal("Build it", {
    AI_API_KEY: "test-key",
    AI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "ai");
  assert.equal(result.proposal.title, "Provider milestone");
});

test("AI evidence advisory falls back safely when provider output is invalid", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({
      choices: [{ message: { content: '{"summary":"bad"}' } }],
    }))) as typeof fetch;
  const result = await resolveEvidenceAdvisory("Ship code", ["code file"], {
    AI_API_KEY: "test-key",
    AI_MODEL: "test-model",
  }, fetchImpl);
  assert.equal(result.source, "deterministic");
  assert.equal(Array.isArray(result.advisory.concerns), true);
});

test("AI evidence advisory uses a valid structured provider response", async () => {
  let requestBody = "";
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        summary: "The submitted file matches the acceptance criteria.",
        matchedCriteria: ["Deliverable is provided"],
        concerns: [],
      }) } }],
    }));
  }) as typeof fetch;

  const result = await resolveEvidenceAdvisory("Deliverable is provided", ["delivery.pdf"], {
    AI_API_KEY: "test-key",
    AI_MODEL: "test-model",
  }, fetchImpl);

  assert.equal(result.source, "ai");
  assert.deepEqual(result.advisory.matchedCriteria, ["Deliverable is provided"]);
  // The provider contract must request the fields the parser validates and must
  // never ask the model for an approval decision.
  assert.match(requestBody, /matchedCriteria/);
  assert.doesNotMatch(requestBody, /recommended/);
});

test("AI output parsers reject incomplete structures", () => {
  assert.equal(parseMilestoneProposal({ title: "Incomplete" }), null);
  assert.equal(parseEvidenceAdvisory({ summary: "Missing arrays" }), null);
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

test("deterministic fallback remains available for AI failures", () => {
  assert.match(deterministicMilestoneProposal("Build and deliver a website.").title, /Deliver|milestone/i);
  assert.equal(
    deterministicEvidenceAdvisory("Approved website", []).concerns[0],
    "Evidence is missing.",
  );
});
