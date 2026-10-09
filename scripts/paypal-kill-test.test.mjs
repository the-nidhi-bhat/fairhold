// Unit tests for the PayPal kill-test request builder and link parsing.
// No network, no orders, no credentials touched. Run:
//   node --test scripts/paypal-kill-test.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreateOrderBody, findApprovalUrl } from "./paypal-kill-test.mjs";

// Mirror the script's defaults so the test passes under env overrides too.
const EXPECTED_CURRENCY = process.env.KILL_TEST_CURRENCY || "USD";
const EXPECTED_AMOUNT = process.env.KILL_TEST_ORDER_AMOUNT || "90.00";

test("create body: AUTHORIZE intent", () => {
  assert.equal(buildCreateOrderBody().intent, "AUTHORIZE");
});

test("create body: configured amount and currency", () => {
  const { amount } = buildCreateOrderBody().purchase_units[0];
  assert.equal(amount.value, EXPECTED_AMOUNT);
  assert.equal(amount.currency_code, EXPECTED_CURRENCY);
});

test("create body: modern payment_source.paypal.experience_context", () => {
  const ctx = buildCreateOrderBody().payment_source?.paypal?.experience_context;
  assert.ok(ctx, "experience_context must be present");
  assert.equal(ctx.user_action, "CONTINUE");
  assert.equal(ctx.shipping_preference, "NO_SHIPPING");
  assert.equal(typeof ctx.return_url, "string");
  assert.equal(typeof ctx.cancel_url, "string");
});

test("create body: legacy application_context is gone", () => {
  assert.equal(buildCreateOrderBody().application_context, undefined);
});

test("link parsing: prefers approve", () => {
  const href = "https://www.sandbox.paypal.com/checkoutnow?token=1";
  assert.equal(
    findApprovalUrl({
      links: [
        { rel: "self", href: "x" },
        { rel: "payer-action", href: "y" },
        { rel: "approve", href },
      ],
    }),
    href,
  );
});

test("link parsing: falls back to payer-action", () => {
  const href = "https://www.sandbox.paypal.com/checkoutnow?token=2";
  assert.equal(
    findApprovalUrl({ links: [{ rel: "payer-action", href }] }),
    href,
  );
});

test("link parsing: returns null when no approval link exists", () => {
  assert.equal(findApprovalUrl({ links: [{ rel: "self", href: "x" }] }), null);
  assert.equal(findApprovalUrl({}), null);
});
