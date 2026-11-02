import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmountToCents,
  validateDealInput,
  validateMilestoneInput,
} from "./validation.ts";

test("parseAmountToCents: accepts common money formats", () => {
  assert.equal(parseAmountToCents("90"), 9000);
  assert.equal(parseAmountToCents("90.5"), 9050);
  assert.equal(parseAmountToCents("$1,200.00"), 120000);
});

test("parseAmountToCents: rejects invalid or non-positive input", () => {
  for (const bad of ["", "0", "0.00", "-5", "abc", "1.234", "$"]) {
    assert.equal(parseAmountToCents(bad), null, `expected null for ${bad}`);
  }
});

test("validateDealInput: accepts a valid deal and pins currency to USD", () => {
  const result = validateDealInput({
    title: "Website redesign",
    clientName: "Acme Inc.",
    freelancerName: "Sam Rivera",
    currency: "usd",
    agreement: "Deliver the new marketing site with five pages and a CMS.",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.currency, "USD");
    assert.equal(result.value.title, "Website redesign");
  }
});

test("validateDealInput: rejects non-USD, short title and short agreement", () => {
  const result = validateDealInput({
    title: "x",
    clientName: "",
    freelancerName: "",
    currency: "EUR",
    agreement: "too short",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.currency);
    assert.ok(result.errors.title);
    assert.ok(result.errors.agreement);
    assert.ok(result.errors.clientName);
    assert.ok(result.errors.freelancerName);
  }
});

test("validateMilestoneInput: computes integer cents and keeps the due date", () => {
  const result = validateMilestoneInput({
    title: "Design system",
    description: "",
    amount: "500",
    dueDate: "2026-11-01",
    acceptanceCriteria: "Figma file delivered with components.",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.amountCents, 50000);
    assert.equal(result.value.dueDate, "2026-11-01");
  }
});

test("validateMilestoneInput: rejects bad amount, date and criteria", () => {
  const result = validateMilestoneInput({
    title: "x",
    amount: "abc",
    dueDate: "2026-13-40",
    acceptanceCriteria: "no",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.amount);
    assert.ok(result.errors.dueDate);
    assert.ok(result.errors.acceptanceCriteria);
  }
});

test("validateMilestoneInput: allows an omitted due date", () => {
  const result = validateMilestoneInput({
    title: "Kickoff",
    amount: "10",
    dueDate: "",
    acceptanceCriteria: "Kickoff call completed.",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.dueDate, null);
});
