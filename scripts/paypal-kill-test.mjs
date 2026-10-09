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
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

// Local-only redirect targets for the hosted checkout. Not used to move money.
const RETURN_URL =
  process.env.KILL_TEST_RETURN_URL || "http://localhost:3000/kill-test/return";
const CANCEL_URL =
  process.env.KILL_TEST_CANCEL_URL || "http://localhost:3000/kill-test/cancel";

// ---------------------------------------------------------------------------
// .env loader (minimal, no dependency). Real env vars win over file values.
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
loadDotEnv();

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

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    die(`Could not parse local state file ${STATE_PATH}. Delete it and retry.`);
  }
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
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

let cachedToken = null;
async function accessToken() {
  if (cachedToken) return cachedToken;
  const { clientId, clientSecret } = requireConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${SANDBOX_HOST}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
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

async function api(method, path, { token, body, requestId } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${SANDBOX_HOST}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
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

async function cmdCreate({ reset }) {
  const token = await accessToken();
  if (reset) {
    saveState({});
    info("Reset local state (--new).");
  }
  const body = buildCreateOrderBody();
  const { ok, status, data } = await api("POST", "/v2/checkout/orders", {
    token,
    body,
    requestId: randomUUID(),
  });
  if (!ok) die(`Create order failed: HTTP ${status} (${safeError(data)}).`);
  const state = loadState();
  state.orderId = data.id;
  state.orderStatus = data.status;
  state.approveUrl = findApprovalUrl(data);
  state.captures = [];
  state.voids = [];
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
  if (!state.orderId) die("No orderId in local state. Run `create` first.");
  const token = await accessToken();
  const { ok, status, data } = await api(
    "POST",
    `/v2/checkout/orders/${state.orderId}/authorize`,
    { token, body: {}, requestId: randomUUID() },
  );
  const authId = extractAuthorizationId(data);
  if (!ok || !authId) {
    die(
      `Authorize failed: HTTP ${status} (${safeError(data)}). ` +
        `The order may not be buyer-approved yet.`,
    );
  }
  state.authorizationId = authId;
  state.authorizationStatus = "CREATED";
  saveState(state);
  info(`Authorize: HTTP ${status}`);
  info(`  order id         : ${state.orderId}`);
  info(`  authorization id : ${authId}`);
  info(`\nNext: node scripts/paypal-kill-test.mjs capture`);
}

async function cmdCapture({ final, amount }) {
  const state = loadState();
  if (!state.authorizationId)
    die("No authorizationId in local state. Run `authorize` first.");
  const token = await accessToken();
  const value = amount || CAPTURE_AMOUNT;
  const invoice = uniqueInvoice("fairhold-killtest-capture");
  const { ok, status, data } = await api(
    "POST",
    `/v2/payments/authorizations/${state.authorizationId}/capture`,
    {
      token,
      requestId: randomUUID(),
      body: {
        amount: { currency_code: CURRENCY, value },
        invoice_id: invoice,
        final_capture: Boolean(final),
      },
    },
  );
  state.captures = state.captures || [];
  const record = {
    attempt: state.captures.length + 1,
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
  info(`  capture id  : ${record.captureId || "<none>"}`);
  info(`  capture st. : ${record.status}`);
  info("\nRun `get-auth` to check the authorization's remaining state.");
}

async function cmdVoid() {
  const state = loadState();
  if (!state.authorizationId)
    die("No authorizationId in local state. Run `authorize` first.");
  const token = await accessToken();
  const { ok, status, data } = await api(
    "POST",
    `/v2/payments/authorizations/${state.authorizationId}/void`,
    { token, requestId: randomUUID() },
  );
  state.voids = state.voids || [];
  state.voids.push({
    httpStatus: status,
    ok,
    error: ok ? null : safeError(data),
  });
  saveState(state);
  info(`Void: HTTP ${status} (${ok ? "accepted" : "rejected"})`);
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

export { buildCreateOrderBody, findApprovalUrl };

// Only dispatch when executed directly, so tests can import safely.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    die(err?.message || String(err));
  });
}
