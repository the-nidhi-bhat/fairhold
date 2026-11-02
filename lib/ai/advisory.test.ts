import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicEvidenceAdvisory,
  deterministicMilestoneProposal,
  parseEvidenceAdvisory,
  parseMilestoneProposal,
} from "./advisory.ts";

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
