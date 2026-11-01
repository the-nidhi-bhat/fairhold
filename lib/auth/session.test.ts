import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeDemoSession,
  encodeDemoSession,
  type DemoSession,
} from "./session-token.ts";
import { authorizeDemoLogin, authorizeReviewerDeal } from "./demo-allowlist.ts";

const session: DemoSession = { name: "Alex Buyer", role: "buyer" };

test("demo session round trip preserves role and name", () => {
  assert.deepEqual(decodeDemoSession(encodeDemoSession(session)), session);
});

test("demo session signature is required", () => {
  assert.equal(decodeDemoSession("invalid.invalid"), null);
  assert.equal(decodeDemoSession(`${encodeDemoSession(session)}tampered`), null);
});

test("demo session expires at the signed server-side timestamp", () => {
  const now = 1_700_000_000_000;
  const token = encodeDemoSession(session, now);
  assert.deepEqual(decodeDemoSession(token, now + 1), session);
  assert.equal(decodeDemoSession(token, now + 8 * 60 * 60 * 1000 + 1), null);
});

test("demo login allowlist rejects unlisted roles and identities", () => {
  const env = {
    FAIRHOLD_DEMO_BUYERS: "Alex Buyer",
    FAIRHOLD_DEMO_SELLERS: "Jamie Seller",
    FAIRHOLD_DEMO_REVIEWERS: "Morgan Reviewer",
  };
  assert.equal(authorizeDemoLogin({ name: "Alex Buyer", role: "buyer" }, env), true);
  assert.equal(authorizeDemoLogin({ name: "Unknown", role: "buyer" }, env), false);
  assert.equal(authorizeDemoLogin({ name: "Morgan Reviewer", role: "reviewer" }, env), true);
  assert.equal(authorizeDemoLogin({ name: "Alex Buyer", role: "reviewer" }, env), false);
  assert.equal(authorizeDemoLogin({ name: "Morgan Reviewer", role: "seller" }, env), false);
});

test("reviewers require an explicit deal grant and cannot bypass membership", () => {
  const env = {
    FAIRHOLD_DEMO_REVIEWERS: "Morgan Reviewer",
    FAIRHOLD_REVIEWER_DEALS: "Morgan Reviewer:deal-1",
  };
  assert.equal(authorizeReviewerDeal("Morgan Reviewer", "deal-1", env), true);
  assert.equal(authorizeReviewerDeal("Morgan Reviewer", "deal-2", env), false);
  assert.equal(authorizeReviewerDeal("Other Reviewer", "deal-1", env), false);
});
