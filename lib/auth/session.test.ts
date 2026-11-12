import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeDemoSession,
  encodeDemoSession,
  type DemoSession,
} from "./session-token.ts";
import { authorizeDemoLogin, authorizeReviewerDeal } from "./demo-allowlist.ts";
import { sessionCookieRequiresSecure } from "./secure-cookie.ts";

// session-token.ts intentionally refuses to fall back to a default secret, so the
// suite configures one itself (as CI does) rather than the product hiding a
// missing secret. Test-only value; never used outside this process.
process.env.FAIRHOLD_SESSION_SECRET ??= "unit-test-session-secret-placeholder";

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

test("a missing session secret fails closed — no silent fallback is used", () => {
  const saved = process.env.FAIRHOLD_SESSION_SECRET;
  delete process.env.FAIRHOLD_SESSION_SECRET;
  try {
    assert.throws(
      () => encodeDemoSession(session),
      /FAIRHOLD_SESSION_SECRET is required/,
    );
    assert.throws(
      () => decodeDemoSession("payload.signature"),
      /FAIRHOLD_SESSION_SECRET is required/,
    );
  } finally {
    process.env.FAIRHOLD_SESSION_SECRET = saved ?? "unit-test-session-secret-placeholder";
  }
});

test("demo login allowlist rejects unlisted roles and identities", () => {
  const env = {
    FAIRHOLD_DEMO_BUYERS: "Alex Buyer",
    FAIRHOLD_DEMO_SELLERS: "Jamie Seller",
    FAIRHOLD_DEMO_REVIEWERS: "Morgan Reviewer",
  };
  assert.equal(authorizeDemoLogin({ name: "Alex Buyer", role: "buyer" }, env), true);
  assert.equal(authorizeDemoLogin({ name: "Jamie Seller", role: "seller" }, env), true);
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

test("removed demo defaults and empty allowlists fail closed", () => {
  assert.equal(authorizeDemoLogin({ name: "Alex Buyer", role: "buyer" }, {}), false);
  assert.equal(authorizeDemoLogin({ name: "Jamie Seller", role: "seller" }, {}), false);
  assert.equal(authorizeDemoLogin({ name: "Morgan Reviewer", role: "reviewer" }, {}), false);
  assert.equal(authorizeDemoLogin({ name: "Alex Buyer", role: "buyer" }, {
    FAIRHOLD_DEMO_BUYERS: "  ",
  }), false);
});

test("malformed or role-impersonating reviewer grants fail closed", () => {
  const env = {
    FAIRHOLD_DEMO_REVIEWERS: "Morgan Reviewer",
    FAIRHOLD_REVIEWER_DEALS: "Morgan Reviewer-deal-1,Morgan Reviewer:deal-1:extra",
  };
  assert.equal(authorizeReviewerDeal("Morgan Reviewer", "deal-1", env), false);
  assert.equal(authorizeReviewerDeal("Morgan Reviewer", "deal-1:extra", env), false);
  assert.equal(authorizeDemoLogin({ name: "Morgan Reviewer", role: "buyer" }, env), false);
});

test("session cookie Secure flag follows the request scheme, not NODE_ENV", () => {
  // Plain-HTTP server (local `next start` / Playwright E2E): WebKit rejects
  // Secure cookies on http origins and silently drops the session, so this
  // must be false even in a production build.
  assert.equal(sessionCookieRequiresSecure(null), false);
  assert.equal(sessionCookieRequiresSecure("http"), false);
  assert.equal(sessionCookieRequiresSecure("http, https"), false);
  // TLS deployments (Vercel sets X-Forwarded-Proto: https) stay Secure.
  assert.equal(sessionCookieRequiresSecure("https"), true);
  assert.equal(sessionCookieRequiresSecure("HTTPS"), true);
  assert.equal(sessionCookieRequiresSecure("  https  "), true);
  assert.equal(sessionCookieRequiresSecure("https, http"), true);
});
