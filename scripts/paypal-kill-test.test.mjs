// Unit tests for the PayPal kill-test request builder and link parsing.
// No network, no orders, no credentials touched. Run:
//   node --test scripts/paypal-kill-test.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateOrderBody,
  findApprovalUrl,
  fetchWithTimeout,
  archiveForNewOrder,
  validatePaymentState,
  parseAmount,
  pendingMarkers,
  confirmedCaptureTotal,
  checkCaptureAmount,
  resolvePending,
  unknownOutcomeMessage,
  summarizeOrderCaptures,
} from "./paypal-kill-test.mjs";

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

// ---------------------------------------------------------------------------
// Timeout handling — Offline. Uses an injected fetch; never touches network.
// ---------------------------------------------------------------------------
test("timeout: a hung request aborts as a distinct TimeoutError", async () => {
  const hangingFetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  await assert.rejects(
    () =>
      fetchWithTimeout(hangingFetch, "https://api-m.sandbox.paypal.com/x", {}, 10),
    (e) => e.name === "TimeoutError" && e.timeoutMs === 10,
  );
});

test("timeout: non-abort errors pass through unchanged (not a timeout)", async () => {
  const boom = new Error("connection reset");
  const failingFetch = () => Promise.reject(boom);
  await assert.rejects(
    () => fetchWithTimeout(failingFetch, "https://x", {}, 50),
    (e) => e === boom,
  );
});

test("timeout: a fast response resolves normally", async () => {
  const okFetch = () => Promise.resolve({ ok: true, status: 200 });
  const res = await fetchWithTimeout(okFetch, "https://x", {}, 50);
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------------------
// State integrity — stale authorization, history preservation.
// ---------------------------------------------------------------------------
test("archive: preserves the previous run history, never erases it", () => {
  const before = {
    orderId: "ORDER-1",
    orderStatus: "PAYER_ACTION_REQUIRED",
    approveUrl: "https://www.sandbox.paypal.com/checkoutnow?token=1",
    authorizationId: "AUTH-OLD",
    authorizationStatus: "CREATED",
    captures: [{ attempt: 1, ok: true, finalCapture: false }],
    voids: [],
  };
  const next = archiveForNewOrder(before);
  assert.equal(next.orderId, null);
  assert.equal(next.authorizationId, null, "stale auth id must be dropped");
  assert.equal(next.captures.length, 0);
  assert.equal(next.runs.length, 1);
  assert.equal(next.runs[0].orderId, "ORDER-1");
  assert.equal(next.runs[0].authorizationId, "AUTH-OLD");
  assert.equal(next.runs[0].captures.length, 1);
});

test("archive: repeated orders accumulate history", () => {
  // create B replaces order A -> A archived
  const afterB = archiveForNewOrder({ orderId: "A" });
  assert.equal(afterB.runs.length, 1);
  // create C replaces order B -> A and B archived
  const afterC = archiveForNewOrder({ ...afterB, orderId: "B" });
  assert.equal(afterC.runs.length, 2);
  assert.deepEqual(
    afterC.runs.map((r) => r.orderId),
    ["A", "B"],
  );
});

// ---------------------------------------------------------------------------
// Validation — missing / stale / terminal / unresolved state, repeat actions.
// ---------------------------------------------------------------------------
test("validate: rejects missing state", () => {
  assert.equal(validatePaymentState(null, "capture").ok, false);
});

test("validate: rejects missing orderId", () => {
  const r = validatePaymentState({ authorizationId: "A" }, "capture");
  assert.equal(r.ok, false);
  assert.match(r.reason, /orderId/);
});

test("validate: rejects missing authorizationId", () => {
  const r = validatePaymentState({ orderId: "O" }, "capture");
  assert.equal(r.ok, false);
  assert.match(r.reason, /authorizationId/);
});

test("validate: accepts capture with complete state", () => {
  assert.equal(
    validatePaymentState({ orderId: "O", authorizationId: "A" }, "capture").ok,
    true,
  );
});

test("validate: refuses capture on a VOIDED authorization", () => {
  const r = validatePaymentState(
    { orderId: "O", authorizationId: "A", authorizationStatus: "VOIDED" },
    "capture",
  );
  assert.equal(r.ok, false);
});

test("validate: refuses a second capture after a successful final capture", () => {
  const r = validatePaymentState(
    {
      orderId: "O",
      authorizationId: "A",
      captures: [{ finalCapture: true, ok: true }],
    },
    "capture",
  );
  assert.equal(r.ok, false);
});

test("validate: refuses capture while a prior capture is UNRESOLVED", () => {
  const r = validatePaymentState(
    { orderId: "O", authorizationId: "A", pendingCapture: { requestId: "r" } },
    "capture",
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /UNRESOLVED|pendingCapture/);
});

test("validate: refuses a second void after a successful void", () => {
  const r = validatePaymentState(
    { orderId: "O", authorizationId: "A", voids: [{ ok: true }] },
    "void",
  );
  assert.equal(r.ok, false);
});

test("validate: allows a retried void after a rejected (non-ok) void", () => {
  const r = validatePaymentState(
    { orderId: "O", authorizationId: "A", voids: [{ ok: false }] },
    "void",
  );
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// Amount validation.
// ---------------------------------------------------------------------------
test("amount: normalizes a valid amount to two decimals", () => {
  assert.deepEqual(parseAmount("10"), { ok: true, value: "10.00" });
  assert.deepEqual(parseAmount(7.5), { ok: true, value: "7.50" });
});

test("amount: rejects missing / zero / negative / non-numeric", () => {
  assert.equal(parseAmount(undefined).ok, false);
  assert.equal(parseAmount("").ok, false);
  assert.equal(parseAmount("0").ok, false);
  assert.equal(parseAmount("-5").ok, false);
  assert.equal(parseAmount("abc").ok, false);
});

// ---------------------------------------------------------------------------
// Recovery — pendingAuthorize lifecycle, cross-action blocks, resolve.
// ---------------------------------------------------------------------------
test("validate: authorize requires only an orderId", () => {
  assert.equal(validatePaymentState({}, "authorize").ok, false);
  assert.equal(validatePaymentState({ orderId: "O" }, "authorize").ok, true);
});

test("validate: refuses a second authorize once an authorization exists", () => {
  const r = validatePaymentState({ orderId: "O", authorizationId: "A" }, "authorize");
  assert.equal(r.ok, false);
  assert.match(r.reason, /second hold|already/);
});

test("validate: refuses a second authorize while a prior authorize is UNRESOLVED", () => {
  const r = validatePaymentState(
    { orderId: "O", pendingAuthorize: { requestId: "r" } },
    "authorize",
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /UNRESOLVED/);
});

test("validate: ANY unresolved operation blocks ALL money-moving actions", () => {
  const base = { orderId: "O", authorizationId: "A" };
  const cases = [
    [{ ...base, pendingVoid: { requestId: "v" } }, "capture"],
    [{ ...base, pendingAuthorize: { requestId: "a" } }, "capture"],
    [{ ...base, pendingCapture: { requestId: "c" } }, "void"],
    [{ ...base, pendingCapture: { requestId: "c" } }, "authorize"],
  ];
  for (const [state, action] of cases) {
    const r = validatePaymentState(state, action);
    assert.equal(r.ok, false, `${action} should be blocked while UNRESOLVED`);
    assert.match(r.reason, /UNRESOLVED/);
  }
});

test("resolve: moves the pending marker into resolved history", () => {
  const state = {
    orderId: "O",
    pendingVoid: { requestId: "r", startedAt: "t" },
    voids: [],
  };
  const result = resolvePending(state, "void");
  assert.equal(result.ok, true);
  assert.equal(result.state.pendingVoid, undefined);
  assert.equal(result.state.resolved.length, 1);
  assert.equal(result.state.resolved[0].operation, "void");
  assert.equal(result.state.resolved[0].requestId, "r");
  assert.ok(result.state.resolved[0].resolvedAt);
  assert.equal(state.pendingVoid.requestId, "r", "input must not be mutated");
});

test("resolve: refuses when nothing is unresolved or the op is unknown", () => {
  assert.equal(resolvePending({ orderId: "O" }, "capture").ok, false);
  assert.equal(resolvePending({ pendingCapture: {} }, "bogus").ok, false);
});

test("pendingMarkers: lists every unresolved operation, in order", () => {
  const markers = pendingMarkers({
    pendingCapture: { requestId: "1" },
    pendingAuthorize: { requestId: "2" },
  });
  assert.deepEqual(
    markers.map((m) => m.action),
    ["capture", "authorize"],
  );
  assert.equal(pendingMarkers({ orderId: "O" }).length, 0);
});

test("unknownOutcomeMessage: reports UNKNOWN and the explicit reconcile path", () => {
  const msg = unknownOutcomeMessage("POST", "/v2/checkout/orders/O/authorize");
  assert.match(msg, /UNKNOWN/);
  assert.match(msg, /may have processed/);
  assert.match(msg, /resolve <op> --confirmed/);
});

test("unknownOutcomeMessage: a read failure never claims PayPal processed an operation", () => {
  const msg = unknownOutcomeMessage("GET", "/v2/payments/authorizations/A");
  assert.match(msg, /READ/);
  assert.doesNotMatch(msg, /may have processed it/);
  assert.match(msg, /no money-moving operation/);
  // Still must not imply any read auto-clears a marker on its own.
  assert.match(msg, /never clears a marker/);
  assert.match(msg, /positively shows an authorization/);
});

// ---------------------------------------------------------------------------
// Amount safety — only confirmed COMPLETED captures count toward the total.
// ---------------------------------------------------------------------------
test("amount: confirmed total counts only accepted COMPLETED captures", () => {
  const state = {
    captures: [
      { ok: true, status: "COMPLETED", amount: "10.00" },
      { ok: true, status: "PENDING", amount: "10.00" },
      { ok: false, status: "REJECTED", amount: "10.00" },
      { ok: true, status: "COMPLETED", amount: "5.50" },
    ],
  };
  assert.equal(confirmedCaptureTotal(state), 15.5);
});

test("amount: refuses local over-capture when the authorized amount is known", () => {
  const state = {
    authorizationAmount: "90.00",
    captures: [{ ok: true, status: "COMPLETED", amount: "10.00" }],
  };
  const under = checkCaptureAmount(state, "70.00");
  assert.equal(under.ok, true);
  assert.equal(under.remaining, 80);
  const over = checkCaptureAmount(state, "80.01");
  assert.equal(over.ok, false);
  assert.match(over.reason, /over-capture/);
});

test("amount: cannot validate locally when the authorized amount is unknown", () => {
  const r = checkCaptureAmount({ captures: [] }, "10.00");
  assert.equal(r.ok, true);
  assert.equal(r.remaining, null);
  assert.ok(r.note, "must not present an unreliable total as authoritative");
});

// ---------------------------------------------------------------------------
// Archive — unresolved evidence must survive a new run intact.
// ---------------------------------------------------------------------------
test("archive: unresolved markers and known amounts survive archiving intact", () => {
  const next = archiveForNewOrder({
    orderId: "O",
    authorizationAmount: "90.00",
    pendingCapture: { requestId: "c", amount: "10.00" },
    pendingVoid: { requestId: "v" },
    pendingAuthorize: { requestId: "a" },
  });
  assert.deepEqual(next.runs[0].pendingCapture, { requestId: "c", amount: "10.00" });
  assert.equal(next.runs[0].pendingVoid.requestId, "v");
  assert.equal(next.runs[0].pendingAuthorize.requestId, "a");
  assert.equal(next.runs[0].authorizationAmount, "90.00");
  assert.equal(next.pendingCapture, null, "fresh active run has no markers");
  assert.equal(next.authorizationAmount, null, "fresh active run has no stale amount");
});

test("archive: resolved operator attestations survive into the new active run", () => {
  // End-to-end: build a real `resolve` record, then archive it as `create` does.
  const resolved = resolvePending(
    { orderId: "ORDER-1", pendingCapture: { requestId: "req-1", amount: "10.00" } },
    "capture",
  );
  assert.equal(resolved.ok, true);

  const next = archiveForNewOrder(resolved.state);
  assert.equal(next.resolved.length, 1, "attestation must survive archiving");
  assert.equal(next.resolved[0].operation, "capture");
  assert.equal(next.resolved[0].requestId, "req-1");
  assert.match(next.resolved[0].resolvedBy, /operator --confirmed/);
  // History lives in one place only: never duplicated into the archived run.
  assert.equal(next.runs[0].resolved, undefined);
  assert.equal(next.runs[0].orderId, "ORDER-1");
  // The new active run starts clean but keeps the history.
  assert.equal(next.orderId, null);
  assert.equal(next.pendingCapture, null, "fresh active run has no markers");
  // Absent or invalid `resolved` becomes an empty array, never undefined.
  assert.deepEqual(archiveForNewOrder({ orderId: "A" }).resolved, []);
  assert.deepEqual(archiveForNewOrder({ resolved: "bogus" }).resolved, []);
  // Input is never mutated.
  assert.equal(resolved.state.resolved.length, 1);
});

// ---------------------------------------------------------------------------
// Final-capture -> void guard (Phase 0C.1)
// ---------------------------------------------------------------------------
test("validate: refuses void after a successful final capture", () => {
  const r = validatePaymentState(
    {
      orderId: "O",
      authorizationId: "A",
      captures: [{ finalCapture: true, ok: true }],
    },
    "void",
  );
  assert.equal(r.ok, false);
  assert.match(r.reason, /final capture/);
});

test("validate: void is allowed after a non-final capture succeeds", () => {
  const r = validatePaymentState(
    {
      orderId: "O",
      authorizationId: "A",
      captures: [{ finalCapture: false, ok: true }],
    },
    "void",
  );
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// get-order capture rendering (Phase 0C.1)
// ---------------------------------------------------------------------------
test("order-captures: renders ids, statuses, and amounts from provider structure", () => {
  const lines = summarizeOrderCaptures({
    purchase_units: [
      {
        payments: {
          captures: [
            { id: "CAP-1", status: "COMPLETED", amount: { value: "10.00", currency_code: "USD" } },
            { id: "CAP-2", status: "PENDING", amount: { value: "5.50", currency_code: "USD" } },
          ],
        },
      },
    ],
  });
  assert.deepEqual(lines, ["CAP-1: COMPLETED 10.00 USD", "CAP-2: PENDING 5.50 USD"]);
});

test("order-captures: tolerates missing or unexpected fields without inventing values", () => {
  assert.deepEqual(summarizeOrderCaptures({}), []);
  assert.deepEqual(summarizeOrderCaptures({ purchase_units: [{ payments: {} }] }), []);
  assert.deepEqual(
    summarizeOrderCaptures({ purchase_units: [{ payments: { captures: "nope" } }] }),
    [],
  );
  assert.deepEqual(summarizeOrderCaptures(null), []);
  const lines = summarizeOrderCaptures({
    purchase_units: [
      {
        payments: {
          captures: [{}, { id: "CAP-3" }, { id: "CAP-4", status: "COMPLETED" }],
        },
      },
    ],
  });
  assert.deepEqual(lines, ["<none>: <unknown>", "CAP-3: <unknown>", "CAP-4: COMPLETED"]);
});

// ---------------------------------------------------------------------------
// Capture reconciliation invariant (Phase 0C.1): resolve clears the marker but
// never fabricates a capture record or alters totals — providers decide.
// ---------------------------------------------------------------------------
test("resolve: capture resolution never fabricates a record or alters totals", () => {
  const state = {
    orderId: "O",
    authorizationId: "A",
    authorizationAmount: "90.00",
    pendingCapture: { requestId: "r", amount: "10.00", invoiceId: "i", startedAt: "t" },
    captures: [{ ok: true, status: "COMPLETED", amount: "10.00" }],
  };
  const result = resolvePending(state, "capture");
  assert.equal(result.ok, true);
  assert.equal(result.state.captures.length, 1, "resolve must not fabricate a capture record");
  assert.equal(confirmedCaptureTotal(result.state), 10, "totals unchanged");
  assert.equal(result.state.pendingCapture, undefined);
  assert.equal(result.state.resolved[0].requestId, "r");
  assert.match(result.state.resolved[0].resolvedBy, /operator --confirmed/);
});
