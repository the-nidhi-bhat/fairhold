#!/usr/bin/env node
/**
 * FairHold — Phase 0 PayPal Sandbox kill test (server-side only).
 *
 * Purpose: verify, against the PayPal *sandbox*, whether a single
 * intent=AUTHORIZE order supports multiple partial captures and whether the
 * remaining authorization can be voided. This is a throwaway probe, NOT the
 * FairHold payment engine. It never touches the live API and never prints
 * credentials.
 *
 * Usage (commands are resumable; order/authorization IDs persist to a
 * gitignored local state file between invocations):
 *
 *   node scripts/paypal-kill-test.mjs doctor
 *   node scripts/paypal-kill-test.mjs create
 *       -> prints the approval URL + order id; approve it in the sandbox buyer
 *   node scripts/paypal-kill-test.mjs authorize
 *   node scripts/paypal-kill-test.mjs capture          # partial capture #1
 *   node scripts/paypal-kill-test.mjs capture          # partial capture #2
 *   node scripts/paypal-kill-test.mjs capture          # probe capture #3
 *   node scripts/paypal-kill-test.mjs get-auth
 *   node scripts/paypal-kill-test.mjs capture --final  # final capture (if funds remain)
 *   node scripts/paypal-kill-test.mjs state
 *
 *   # separate flow to test void-after-partial-capture:
 *   node scripts/paypal-kill-test.mjs create --new
 *   node scripts/paypal-kill-test.mjs authorize
 *   node scripts/paypal-kill-test.mjs capture
 *   node scripts/paypal-kill-test.mjs void
 *
 * Credentials: read from the environment or a local (gitignored) .env file.
 *   PAYPAL_ENV=sandbox
 *   PAYPAL_CLIENT_ID=...
 *   PAYPAL_CLIENT_SECRET=...
 *
 * Safety: refuses to run unless PAYPAL_ENV resolves to "sandbox". Prints only
 * non-sensitive fields (HTTP status, resource ids, statuses, amounts). Never
 * logs access tokens, the client secret, or Authorization headers.
 *
 * Bounded timeouts: every HTTP request is aborted after KILL_TEST_TIMEOUT_MS
 * (default 15000). For a money-moving request (create / authorize / capture /
 * void) a timeout is reported as an UNKNOWN outcome, is NEVER treated as a
 * payment failure, and is NEVER retried automatically — PayPal may have
 * processed the request. Reconcile provider state before retrying. A timed-out
 * READ (get-order / get-auth / get-capture) is different: it only means the
 * read failed. It started no money-moving operation, sets no unresolved
 * marker, and can simply be re-run once PayPal is reachable.
 *
 * State integrity: creating a new order ARCHIVES the previous run into the
 * `runs` array of the state file instead of erasing its history, and clears any
 * stale authorizationId. Operator attestations in `resolved` carry forward into
 * the new active run rather than being archived away. capture/void/authorize
 * validate the persisted state first and refuse clearly-terminal or unresolved
 * repeats.
 *
 * Unresolved recovery: a timed-out authorize/capture/void leaves an UNRESOLVED
 * marker (pendingAuthorize/pendingCapture/pendingVoid) that BLOCKS all further
 * money-moving commands. A marker is cleared in only two ways:
 *   - `get-order`, and ONLY when the provider response positively confirms an
 *     authorization on that order. When the order shows no authorization the
 *     marker is left exactly as it was.
 *   - the operator, after reconciling provider state, runs
 *     `resolve <op> --confirmed`.
 * `get-auth` never clears a marker: it reports authorization-level state and
 * lists what is still unresolved so the operator can see it, but it cannot say
 * which timed-out request applied. No read ever moves money.
 * Reconcile carefully before resolving — match ids, amounts and invoice ids
 * across get-order / get-auth / get-capture. `resolve <op> --confirmed` MOVES
 * the record into `resolved` history instead of deleting it; it records the
 * operator's attestation, never provider truth.
 *
 * Concurrency: this CLI is single-operator. saveState refuses to write if the
 * state file changed on disk since it was read (concurrent-run detection that
 * fails closed); it is not a lock and offers no cross-process atomicity.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const STATE_PATH = join(HERE, ".paypal-kill-test-state.json");
const SANDBOX_HOST = "https://api-m.sandbox.paypal.com";

const CURRENCY = process.env.KILL_TEST_CURRENCY || "USD";
const ORDER_AMOUNT = process.env.KILL_TEST_ORDER_AMOUNT || "90.00";
const CAPTURE_AMOUNT = process.env.KILL_TEST_CAPTURE_AMOUNT || "10.00";

// Bounded request timeout. Aborts a hung request instead of hanging forever.
const TIMEOUT_MS = Number(process.env.KILL_TEST_TIMEOUT_MS) || 15000;

// Local-only redirect targets for the hosted checkout. Not used to move money.
const RETURN_URL =
  process.env.KILL_TEST_RETURN_URL || "http://localhost:3000/kill-test/return";
const CANCEL_URL =
  process.env.KILL_TEST_CANCEL_URL || "http://localhost:3000/kill-test/cancel";

// ---------------------------------------------------------------------------
// .env loader (minimal, no dependency). Real env vars win over file values.
// Loaded only when this file is the entry script (see dispatch at the bottom),
// so importing it from tests never reads .env.
// ---------------------------------------------------------------------------
function loadDotEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Guards + tiny helpers
// ---------------------------------------------------------------------------
function die(message, code = 1) {
  process.stderr.write(`\nERROR: ${message}\n`);
  process.exit(code);
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

// Module-level mtime of the last state file this process read or wrote. Used
// for stale-write detection: saveState aborts (before writing) if the file
// changed on disk since — e.g. a concurrent harness process. Fails closed.
let stateFileMtime = null;

function loadState() {
  if (!existsSync(STATE_PATH)) {
    stateFileMtime = null;
    return {};
  }
  try {
    const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    stateFileMtime = statSync(STATE_PATH).mtimeMs;
    return state;
  } catch {
    die(`Could not parse local state file ${STATE_PATH}. Delete it and retry.`);
  }
}

function saveState(state) {
  if (stateFileMtime !== null) {
    const current = existsSync(STATE_PATH)
      ? statSync(STATE_PATH).mtimeMs
      : null;
    if (current !== stateFileMtime) {
      die(
        "Local state file changed on disk since it was read (another harness " +
          "process running?). Aborted WITHOUT writing — no state was " +
          "overwritten. Re-check the state (`state`) and re-run.",
        3,
      );
    }
  }
  state.updatedAt = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  stateFileMtime = statSync(STATE_PATH).mtimeMs;
}

function requireConfig() {
  const env = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
  if (env !== "sandbox") {
    die(
      `PAYPAL_ENV resolves to "${env}". This harness is sandbox-only and ` +
        `refuses to run against anything else.`,
    );
  }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const placeholder = (v) => !v || /^your_/i.test(v);
  if (placeholder(clientId) || placeholder(clientSecret)) {
    die(
      "PayPal sandbox credentials are not configured.\n" +
        "  Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in a local, " +
        "gitignored .env file (see .env.example), then re-run.\n" +
        "  This is a BLOCKED prerequisite, not a test failure.",
      2,
    );
  }
  return { clientId, clientSecret };
}

// Bounded HTTP fetch. Aborts after timeoutMs and throws a distinct
// TimeoutError so callers never confuse a timeout with a PayPal business
// error. The fetch implementation is injectable so it can be unit-tested
// offline without any network access.
async function fetchWithTimeout(fetchFn, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } catch (err) {
    const aborted =
      err &&
      (err.name === "AbortError" ||
        err.code === "ABORT_ERR" ||
        err.code === "UND_ERR_ABORTED");
    if (aborted) {
      const timeout = new Error(`request aborted after ${timeoutMs}ms`);
      timeout.name = "TimeoutError";
      timeout.timeoutMs = timeoutMs;
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let cachedToken = null;
async function accessToken() {
  if (cachedToken) return cachedToken;
  const { clientId, clientSecret } = requireConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let res;
  try {
    res = await fetchWithTimeout(
      fetch,
      `${SANDBOX_HOST}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
      TIMEOUT_MS,
    );
  } catch (err) {
    if (err && err.name === "TimeoutError") {
      die(
        `OAuth token request timed out after ${TIMEOUT_MS}ms.\n` +
          `  No token was obtained and no payment operation was started; ` +
          `it is safe to retry manually.`,
        3,
      );
    }
    die(`OAuth token request failed: ${err?.message || String(err)}`, 3);
  }
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok || !data.access_token) {
    die(`OAuth token request failed: HTTP ${res.status} (${safeError(data)}).`);
  }
  cachedToken = data.access_token;
  return cachedToken;
}

function safeError(data) {
  if (!data) return "no body";
  return data.error_description || data.error || data.name || "see status";
}

// Explains an ambiguous failure (timeout, dropped connection after transmit).
//
// Money-moving request: the provider may have processed it, so the outcome is
// UNKNOWN and must be reconciled before any further money-moving request.
// Never auto-retry, and never present it as a payment failure.
//
// Read (GET/HEAD): nothing moved money, so the honest report is only that the
// read failed. It started no money-moving operation and set no marker of its
// own, so it must not be described as an outcome PayPal may have processed.
function isReadMethod(method) {
  return method === "GET" || method === "HEAD";
}

function unknownOutcomeMessage(method, path) {
  if (isReadMethod(method)) {
    return (
      `  ${method} ${path} did not complete (timeout or network error). ` +
      `This was a READ: it started no money-moving operation and left no ` +
      `unresolved marker of its own.\n` +
      `  Re-run it once PayPal is reachable. If \`state\` still shows an ` +
      `unresolved marker, it came from an earlier money-moving request: ` +
      `reconcile with get-order / get-auth / get-capture before ` +
      `\`resolve <op> --confirmed\`. \`get-auth\` never clears a marker; ` +
      `\`get-order\` clears \`pendingAuthorize\` only when the provider ` +
      `positively shows an authorization.`
    );
  }
  return (
    `  The outcome of ${method} ${path} is UNKNOWN — PayPal may have processed it. ` +
    `Do NOT assume it failed and do NOT retry automatically.\n` +
    `  Reconcile provider state first: get-order / get-auth / get-capture.\n` +
    `  \`get-auth\` never clears a marker; \`get-order\` clears ` +
    `\`pendingAuthorize\` only when the provider positively shows an ` +
    `authorization.\n` +
    `  Only after that manual verification, \`resolve <op> --confirmed\` ` +
    `unblocks the harness.`
  );
}

async function api(method, path, { token, body, requestId } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  let res;
  try {
    res = await fetchWithTimeout(
      fetch,
      `${SANDBOX_HOST}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      TIMEOUT_MS,
    );
  } catch (err) {
    if (err && err.name === "TimeoutError") {
      die(
        `Request timed out after ${TIMEOUT_MS}ms (${method} ${path}).\n` +
          unknownOutcomeMessage(method, path),
        3,
      );
    }
    die(
      `Network error (${method} ${path}): ${err?.message || String(err)}\n` +
        unknownOutcomeMessage(method, path),
      3,
    );
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 300) };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

function uniqueInvoice(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Uses only the href PayPal returns; never builds a checkout URL.
function findApprovalUrl(order) {
  const links = order?.links || [];
  const link =
    links.find((l) => l.rel === "approve") ||
    links.find((l) => l.rel === "payer-action");
  return link?.href || null;
}

// Pure builder so the request body can be unit-tested without network access.
function buildCreateOrderBody() {
  return {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: "fairhold-kill-test",
        custom_id: uniqueInvoice("killtest"),
        description: "FairHold Phase 0 kill test",
        amount: { currency_code: CURRENCY, value: ORDER_AMOUNT },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "FairHold Kill Test",
          user_action: "CONTINUE",
          shipping_preference: "NO_SHIPPING",
          return_url: RETURN_URL,
          cancel_url: CANCEL_URL,
        },
      },
    },
  };
}

function extractAuthorizationId(authResponse) {
  return (
    authResponse?.purchase_units?.[0]?.payments?.authorizations?.[0]?.id || null
  );
}

// Render provider-returned capture records (id, status, amount) for get-order.
// Pure so it is unit-testable offline; tolerates missing/unexpected fields
// without crashing or inventing values. Never touches credentials.
function summarizeOrderCaptures(orderData) {
  const captures = orderData?.purchase_units?.[0]?.payments?.captures;
  if (!Array.isArray(captures) || captures.length === 0) return [];
  return captures.map((c) => {
    const id = typeof c?.id === "string" ? c.id : "<none>";
    const status = typeof c?.status === "string" ? c.status : "<unknown>";
    const amount =
      typeof c?.amount?.value === "string"
        ? ` ${c.amount.value}${
            typeof c.amount.currency_code === "string"
              ? ` ${c.amount.currency_code}`
              : ""
          }`
        : "";
    return `${id}: ${status}${amount}`;
  });
}

// ---------------------------------------------------------------------------
// Pure state helpers (no I/O) — exercised by the offline unit tests.
// ---------------------------------------------------------------------------

// Move the current run into the `runs` history and return a fresh active run.
// History is never silently erased when a new order replaces an old one, and
// any stale authorizationId is dropped so it cannot leak onto the new order.
function archiveForNewOrder(state) {
  const prior = state && typeof state === "object" ? state : {};
  const runs = Array.isArray(prior.runs) ? prior.runs.slice() : [];
  if (prior.orderId) {
    runs.push({
      archivedAt: new Date().toISOString(),
      orderId: prior.orderId,
      orderStatus: prior.orderStatus ?? null,
      approveUrl: prior.approveUrl ?? null,
      authorizationId: prior.authorizationId ?? null,
      authorizationStatus: prior.authorizationStatus ?? null,
      authorizationAmount: prior.authorizationAmount ?? null,
      // Unresolved markers survive archiving intact: evidence is never dropped.
      pendingCapture: prior.pendingCapture ?? null,
      pendingVoid: prior.pendingVoid ?? null,
      pendingAuthorize: prior.pendingAuthorize ?? null,
      captures: prior.captures ?? [],
      voids: prior.voids ?? [],
    });
  }
  return {
    runs,
    orderId: null,
    orderStatus: null,
    approveUrl: null,
    authorizationId: null,
    authorizationStatus: null,
    authorizationAmount: null,
    pendingCapture: null,
    pendingVoid: null,
    pendingAuthorize: null,
    captures: [],
    voids: [],
    // Operator attestations are global to this state file: `resolve` writes
    // them here and they carry no orderId, so they carry forward into the new
    // active run instead of being archived per run. Storing a copy inside
    // `runs` would duplicate them, and `runs.push` above only runs when
    // `prior.orderId` exists — so a per-run copy would silently drop
    // attestations whenever there is no order to archive.
    resolved: Array.isArray(prior.resolved) ? prior.resolved.slice() : [],
  };
}

// Deterministic gate for money-moving actions. Rejects incomplete/mismatched
// state, clearly-terminal authorizations, and any operation left UNRESOLVED by
// a prior timeout. These checks are LOCAL and best-effort; PayPal is the
// ultimate authority (e.g. only one void, captures bounded by the authorized
// amount). "authorize" requires only an orderId; capture/void also require an
// authorizationId.
function pendingMarkers(state) {
  const out = [];
  for (const [key, action] of [
    ["pendingCapture", "capture"],
    ["pendingVoid", "void"],
    ["pendingAuthorize", "authorize"],
  ]) {
    if (state[key]) out.push({ key, action, marker: state[key] });
  }
  return out;
}

function validatePaymentState(state, action) {
  if (!state || typeof state !== "object") {
    return { ok: false, reason: "local state is missing or unreadable" };
  }
  if (action === "authorize") {
    if (typeof state.orderId !== "string" || !state.orderId) {
      return { ok: false, reason: "missing orderId — run `create` first" };
    }
  } else {
    const missing = [];
    if (typeof state.orderId !== "string" || !state.orderId)
      missing.push("orderId");
    if (typeof state.authorizationId !== "string" || !state.authorizationId)
      missing.push("authorizationId");
    if (missing.length) {
      return {
        ok: false,
        reason: `missing ${missing.join(" and ")} — run \`create\` then \`authorize\` first`,
      };
    }
  }
  // ANY unresolved operation blocks ALL money-moving actions until the
  // operator explicitly resolves it. Nothing clears these automatically.
  const unresolved = pendingMarkers(state);
  if (unresolved.length) {
    return {
      ok: false,
      reason:
        `UNRESOLVED operation(s): ${unresolved.map((u) => u.action).join(", ")}. ` +
        "Nothing auto-clears them. Reconcile provider state (get-order / " +
        "get-auth / get-capture) and run `resolve <op> --confirmed` after " +
        "manual verification to resume.",
    };
  }
  if (action === "authorize") {
    if (state.authorizationId) {
      return {
        ok: false,
        reason:
          "authorizationId already exists for this order — refusing a second " +
          "hold. Run `create` for a new order, or inspect with `get-auth`.",
      };
    }
    return { ok: true };
  }
  if (action === "capture") {
    if (state.authorizationStatus === "VOIDED")
      return { ok: false, reason: "authorization is VOIDED" };
    if (state.authorizationStatus === "CAPTURED")
      return { ok: false, reason: "authorization is already fully CAPTURED" };
    if ((state.captures || []).some((c) => c && c.finalCapture && c.ok))
      return { ok: false, reason: "a final capture already succeeded" };
  }
  if (action === "void") {
    if (state.authorizationStatus === "VOIDED")
      return { ok: false, reason: "authorization is already VOIDED" };
    if ((state.captures || []).some((c) => c && c.finalCapture && c.ok))
      return {
        ok: false,
        reason:
          "a successful final capture already settled the authorization",
      };
    if ((state.voids || []).some((v) => v && v.ok))
      return { ok: false, reason: "a successful void is already recorded" };
  }
  return { ok: true };
}

// Normalize a capture amount to a positive 2-decimal string, or reject it.
function parseAmount(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: false, reason: "amount is required" };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, reason: `invalid amount: ${raw}` };
  }
  return { ok: true, value: n.toFixed(2) };
}

// Confirmed captures = records PayPal accepted AND reported COMPLETED. Anything
// else (rejected, PENDING, unknown status) is UNKNOWN and never counted.
function confirmedCaptureTotal(state) {
  return (state?.captures || []).reduce((sum, c) => {
    if (c && c.ok && c.status === "COMPLETED") {
      const n = Number(c.amount);
      if (Number.isFinite(n)) return sum + n;
    }
    return sum;
  }, 0);
}

// Local over-capture guard. Refuses when the authorized amount is reliably
// known (recorded from the authorize response or get-auth) and this capture
// would push the confirmed total past it. When the authorized amount or a
// capture record is unknown, the total is treated as unknown and PayPal's own
// validation (422) remains the backstop — the harness never presents an
// unreliable total as authoritative.
function checkCaptureAmount(state, value) {
  const confirmed = confirmedCaptureTotal(state);
  const authRaw = state?.authorizationAmount;
  const auth =
    authRaw === undefined || authRaw === null || authRaw === ""
      ? NaN
      : Number(authRaw);
  if (!Number.isFinite(auth)) {
    return {
      ok: true,
      remaining: null,
      note:
        "authorization amount is not recorded locally; over-capture can only " +
        "be caught by PayPal (422). Run `get-auth` to record it.",
    };
  }
  const remaining = Number((auth - confirmed).toFixed(2));
  const amount = Number(value);
  if (amount > remaining) {
    return {
      ok: false,
      reason:
        `local over-capture: ${value} exceeds the remaining ` +
        `${remaining.toFixed(2)} ${CURRENCY} (authorized ${auth.toFixed(2)}, ` +
        `confirmed captured ${confirmed.toFixed(2)})`,
      remaining,
    };
  }
  return { ok: true, remaining };
}

// Explicit operator intervention: move an UNRESOLVED marker into `resolved`
// history (never delete it). Pure so it is unit-testable; cmdResolve layers
// the --confirmed requirement and saveState on top.
function resolvePending(state, operation) {
  const key = {
    capture: "pendingCapture",
    void: "pendingVoid",
    authorize: "pendingAuthorize",
  }[operation];
  if (!key) return { ok: false, reason: `unknown operation: ${operation}` };
  if (!state || typeof state !== "object" || !state[key]) {
    return { ok: false, reason: `nothing is unresolved for ${operation}` };
  }
  const next = {
    ...state,
    resolved: Array.isArray(state.resolved) ? state.resolved.slice() : [],
  };
  next.resolved.push({
    operation,
    ...state[key],
    resolvedBy: "operator --confirmed",
    resolvedAt: new Date().toISOString(),
  });
  delete next[key];
  return { ok: true, state: next };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function cmdResolve(operation, confirmed) {
  if (!confirmed) {
    die(
      `Refusing to resolve ${operation || "<op>"} without --confirmed.\n` +
        `  Never clear an UNRESOLVED outcome on local guesswork: verify ` +
        `provider state first (get-order / get-auth / get-capture), then ` +
        `re-run with --confirmed.`,
    );
  }
  const state = loadState();
  const result = resolvePending(state, operation);
  if (!result.ok) die(result.reason);
  saveState(result.state);
  info(
    `Resolved ${operation}: marker moved to \`resolved\` history ` +
      `(count ${result.state.resolved.length}).`,
  );
  info(
    "  This records YOUR attestation; provider state remains the source of truth.",
  );
}

function cmdDoctor() {
  info("FairHold PayPal kill-test — config doctor (no network calls)");
  info(`  sandbox host : ${SANDBOX_HOST}`);
  info(`  currency     : ${CURRENCY}`);
  info(`  order amount : ${ORDER_AMOUNT}`);
  info(`  capture amt  : ${CAPTURE_AMOUNT}`);
  const env = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
  info(`  PAYPAL_ENV   : ${env}`);
  if (env !== "sandbox") die("PAYPAL_ENV must be sandbox.");
  const idSet = Boolean(
    process.env.PAYPAL_CLIENT_ID &&
      !/^your_/i.test(process.env.PAYPAL_CLIENT_ID),
  );
  const secretSet = Boolean(
    process.env.PAYPAL_CLIENT_SECRET &&
      !/^your_/i.test(process.env.PAYPAL_CLIENT_SECRET),
  );
  info(`  client id    : ${idSet ? "<set>" : "<unset>"}`);
  info(`  client secret: ${secretSet ? "<set>" : "<unset>"}`);
  if (!idSet || !secretSet) {
    die("Credentials missing — kill test is BLOCKED until configured.", 2);
  }
  info("\nConfig OK. Next: node scripts/paypal-kill-test.mjs create");
}

async function cmdCreate({ reset = false } = {}) {
  const priorState = loadState();
  const unresolved = pendingMarkers(priorState);
  if (unresolved.length) {
    die(
      `Refusing \`create\`: UNRESOLVED operation(s): ` +
        `${unresolved.map((u) => u.action).join(", ")}.\n` +
        `  Unresolved outcomes are never auto-cleared. Reconcile provider state ` +
        `(get-order / get-auth / get-capture) and, after manual verification, ` +
        `run \`resolve <op> --confirmed\` before starting a new run.`,
    );
  }
  const token = await accessToken();
  const body = buildCreateOrderBody();
  const { ok, status, data } = await api("POST", "/v2/checkout/orders", {
    token,
    body,
    requestId: randomUUID(),
  });
  if (!ok) die(`Create order failed: HTTP ${status} (${safeError(data)}).`);
  // Archive the previous run only after the new order succeeded, and never
  // erase payment-operation history.
  const state = archiveForNewOrder(priorState);
  if (state.runs.length) {
    info(`Previous run(s) preserved in \`runs\` (${state.runs.length}).`);
  } else if (reset) {
    info("Starting a fresh run (--new).");
  }
  state.orderId = data.id;
  state.orderStatus = data.status;
  state.approveUrl = findApprovalUrl(data);
  saveState(state);
  info(`Order created: HTTP ${status}`);
  info(`  order id     : ${data.id}`);
  info(`  order status : ${data.status}`);
  info(`  approve URL  : ${state.approveUrl || "<none returned>"}`);
  info("\nOpen the approve URL in a browser signed in as the SANDBOX buyer,");
  info("approve the order, then run: node scripts/paypal-kill-test.mjs authorize");
}

async function cmdAuthorize() {
  const state = loadState();
  const valid = validatePaymentState(state, "authorize");
  if (!valid.ok) die(`Refusing authorize: ${valid.reason}`);
  const token = await accessToken();
  // Fresh idempotency key per authorization attempt, recorded BEFORE the call.
  // A timeout leaves an UNRESOLVED marker that blocks a second hold attempt and
  // can only be cleared by operator intervention.
  const requestId = randomUUID();
  state.pendingAuthorize = {
    requestId,
    startedAt: new Date().toISOString(),
  };
  saveState(state);
  const { ok, status, data } = await api(
    "POST",
    `/v2/checkout/orders/${state.orderId}/authorize`,
    { token, body: {}, requestId },
  );
  // A definite HTTP response (accepted OR rejected) resolves the outcome.
  state.pendingAuthorize = null;
  const authId = extractAuthorizationId(data);
  if (!ok || !authId) {
    saveState(state);
    die(
      `Authorize failed: HTTP ${status} (${safeError(data)}). ` +
        `The order may not be buyer-approved yet.`,
    );
  }
  state.authorizationId = authId;
  state.authorizationStatus = "CREATED";
  const authAmount =
    data?.purchase_units?.[0]?.payments?.authorizations?.[0]?.amount?.value;
  if (authAmount !== undefined && Number.isFinite(Number(authAmount))) {
    state.authorizationAmount = String(authAmount);
  }
  saveState(state);
  info(`Authorize: HTTP ${status}`);
  info(`  order id         : ${state.orderId}`);
  info(`  authorization id : ${authId}`);
  if (state.authorizationAmount) {
    info(`  authorization amt: ${state.authorizationAmount} ${CURRENCY}`);
  }
  info(`\nNext: node scripts/paypal-kill-test.mjs capture`);
}

async function cmdCapture({ final, amount }) {
  const state = loadState();
  const valid = validatePaymentState(state, "capture");
  if (!valid.ok) die(`Refusing capture: ${valid.reason}`);
  const parsed = parseAmount(amount === undefined ? CAPTURE_AMOUNT : amount);
  if (!parsed.ok) die(`Refusing capture: ${parsed.reason}`);
  const value = parsed.value;
  // Local over-capture guard: refuses BEFORE any network call when the
  // authorized amount is known locally and this capture would exceed it.
  const limit = checkCaptureAmount(state, value);
  if (!limit.ok) die(`Refusing capture: ${limit.reason}`);
  const token = await accessToken();
  const invoice = uniqueInvoice("fairhold-killtest-capture");
  // A fresh idempotency key per intentional capture. Never reused across
  // captures. Recorded before the call so a timeout leaves a reconcilable
  // trace instead of silence.
  const requestId = randomUUID();
  state.pendingCapture = {
    requestId,
    amount: value,
    finalCapture: Boolean(final),
    invoiceId: invoice,
    startedAt: new Date().toISOString(),
  };
  saveState(state);
  const { ok, status, data } = await api(
    "POST",
    `/v2/payments/authorizations/${state.authorizationId}/capture`,
    {
      token,
      requestId,
      body: {
        amount: { currency_code: CURRENCY, value },
        invoice_id: invoice,
        final_capture: Boolean(final),
      },
    },
  );
  // A definite HTTP response (accepted OR rejected) means the outcome is
  // known; clear the unresolved marker.
  state.pendingCapture = null;
  state.captures = state.captures || [];
  const record = {
    attempt: state.captures.length + 1,
    requestId,
    invoiceId: invoice,
    amount: value,
    finalCapture: Boolean(final),
    httpStatus: status,
    ok,
    captureId: ok ? data?.id || null : null,
    status: ok ? data?.status || null : safeError(data),
  };
  state.captures.push(record);
  saveState(state);
  info(`Capture #${record.attempt}: HTTP ${status} (${ok ? "accepted" : "rejected"})`);
  info(`  amount      : ${value} ${CURRENCY}`);
  info(`  final       : ${record.finalCapture}`);
  info(`  request id  : ${requestId}`);
  info(`  capture id  : ${record.captureId || "<none>"}`);
  info(`  capture st. : ${record.status}`);
  const authAmount = Number(state.authorizationAmount);
  if (Number.isFinite(authAmount)) {
    const remaining = Number(
      (authAmount - confirmedCaptureTotal(state)).toFixed(2),
    );
    info(`  approx. remaining: ${remaining.toFixed(2)} ${CURRENCY}`);
  } else if (limit.note) {
    info(`  note: ${limit.note}`);
  }
  info("\nRun `get-auth` to check the authorization's remaining state.");
}

async function cmdVoid() {
  const state = loadState();
  const valid = validatePaymentState(state, "void");
  if (!valid.ok) die(`Refusing void: ${valid.reason}`);
  const token = await accessToken();
  const requestId = randomUUID();
  state.pendingVoid = { requestId, startedAt: new Date().toISOString() };
  saveState(state);
  const { ok, status, data } = await api(
    "POST",
    `/v2/payments/authorizations/${state.authorizationId}/void`,
    { token, requestId },
  );
  state.pendingVoid = null;
  state.voids = state.voids || [];
  state.voids.push({
    requestId,
    httpStatus: status,
    ok,
    error: ok ? null : safeError(data),
  });
  saveState(state);
  info(`Void: HTTP ${status} (${ok ? "accepted" : "rejected"})`);
  info(`  request id  : ${requestId}`);
  if (!ok) info(`  reason: ${safeError(data)}`);
  info(`\nNext: node scripts/paypal-kill-test.mjs get-auth`);
}

async function cmdGetOrder() {
  const state = loadState();
  if (!state.orderId) die("No orderId in local state.");
  const token = await accessToken();
  const { ok, status, data } = await api(
    "GET",
    `/v2/checkout/orders/${state.orderId}`,
    { token },
  );
  info(`Get order: HTTP ${status}`);
  if (ok) {
    info(`  order id     : ${data.id}`);
    info(`  order status : ${data.status}`);
    info(`  intent       : ${data.intent}`);
    // Provider-returned captures in this order (id/status/amount). Used to
    // reconcile a timed-out capture manually: match by id + amount.
    const captureLines = summarizeOrderCaptures(data);
    if (captureLines.length) {
      info("  captures:");
      for (const line of captureLines) {
        info(`    ${line}`);
      }
    } else {
      info("  captures: <none returned>");
    }
    // Reconcile a timed-out authorize: the order either now carries an
    // authorization (the POST applied — record it) or it does not (the POST
    // did not apply — but do NOT auto-clear; the operator confirms with
    // `resolve authorize --confirmed`).
    if (state.pendingAuthorize) {
      const authId = extractAuthorizationId(data);
      if (authId) {
        state.authorizationId = authId;
        state.authorizationStatus =
          data?.purchase_units?.[0]?.payments?.authorizations?.[0]?.status ||
          "CREATED";
        state.pendingAuthorize = null;
        info(`  reconciled authorize: authorization ${authId} exists — pendingAuthorize cleared.`);
      } else {
        info(
          "  vendor state shows NO authorization on this order. pendingAuthorize is " +
            "NOT auto-cleared: verify manually, then run `resolve authorize --confirmed`.",
        );
      }
      saveState(state);
    }
  } else {
    info(`  error: ${safeError(data)}`);
  }
}

async function cmdGetAuth() {
  const state = loadState();
  if (!state.authorizationId) die("No authorizationId in local state.");
  const token = await accessToken();
  const { ok, status, data } = await api(
    "GET",
    `/v2/payments/authorizations/${state.authorizationId}`,
    { token },
  );
  info(`Get authorization: HTTP ${status}`);
  if (ok) {
    info(`  authorization id : ${data.id}`);
    info(`  status           : ${data.status}`);
    const amt = data.amount;
    if (amt) info(`  amount           : ${amt.value} ${amt.currency_code}`);
    if (data.status_details) {
      info(`  status reason    : ${JSON.stringify(data.status_details)}`);
    }
    state.authorizationStatus = data.status;
    const amtValue = amt && amt.value;
    if (amtValue !== undefined && Number.isFinite(Number(amtValue))) {
      state.authorizationAmount = String(amtValue);
    }
    const unresolved = pendingMarkers(state);
    if (unresolved.length) {
      info("  UNRESOLVED operation(s) — get-auth does NOT clear these:");
      for (const u of unresolved) {
        const m = u.marker;
        info(
          `    ${u.action}: requestId=${m.requestId} startedAt=${m.startedAt}` +
            (m.invoiceId ? ` invoiceId=${m.invoiceId}` : "") +
            (m.amount ? ` amount=${m.amount}` : ""),
        );
      }
      info(
        "    This read shows authorization-level state only; it cannot identify " +
          "which timed-out request applied. Use get-capture <id> / the invoice " +
          "id / order state for that. After MANUAL verification, " +
          "`resolve <op> --confirmed` unblocks the harness.",
      );
    }
    saveState(state);
  } else {
    info(`  error: ${safeError(data)}`);
  }
}

async function cmdGetCapture(captureId) {
  if (!captureId) die("Usage: get-capture <captureId>");
  const token = await accessToken();
  const { ok, status, data } = await api(
    "GET",
    `/v2/payments/captures/${captureId}`,
    { token },
  );
  info(`Get capture: HTTP ${status}`);
  if (ok) {
    info(`  capture id : ${data.id}`);
    info(`  status     : ${data.status}`);
  } else {
    info(`  error: ${safeError(data)}`);
  }
}

function cmdState() {
  const state = loadState();
  info(JSON.stringify(state, null, 2));
}

function printUsage() {
  info(
    [
      "FairHold PayPal sandbox kill test",
      "",
      "  doctor         Check config/sandbox guard (no network)",
      "  create [--new] Create intent=AUTHORIZE order; prints approval URL",
      "  authorize      Authorize the approved order",
      "  capture [amt] [--final]  Capture against the authorization",
      "  void           Void the remaining authorization",
      "  get-order      Show order state",
      "  get-auth       Show authorization state",
      "  get-capture <id>  Show capture state",
      "  resolve capture|void|authorize --confirmed",
      "                Operator reconcile of an UNRESOLVED outcome (never automatic)",
      "  state          Print local (non-secret) state",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const positional = rest.filter((a) => !a.startsWith("--"));

  switch (command) {
    case "doctor":
      return cmdDoctor();
    case "create":
      return cmdCreate({ reset: flags.has("--new") });
    case "authorize":
      return cmdAuthorize();
    case "capture":
      return cmdCapture({
        final: flags.has("--final"),
        amount: positional[0],
      });
    case "void":
      return cmdVoid();
    case "resolve":
      return cmdResolve(positional[0], flags.has("--confirmed"));
    case "get-order":
      return cmdGetOrder();
    case "get-auth":
      return cmdGetAuth();
    case "get-capture":
      return cmdGetCapture(positional[0]);
    case "state":
      return cmdState();
    default:
      printUsage();
      if (command) die(`Unknown command: ${command}`);
  }
}

export {
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
};

// Only dispatch when executed directly, so tests can import safely — and only
// then load .env, so importing the module from tests never reads it.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  loadDotEnv();
  main().catch((err) => {
    die(err?.message || String(err));
  });
}
