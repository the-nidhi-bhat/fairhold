import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PayPalSandboxProvider,
  mapWebhookEvent,
  verifyWebhookSignature,
  WebhookVerificationError,
} from "./paypal.ts";
import { readPayPalConfig } from "./config.ts";
import { getPaymentProvider } from "./index.ts";
import { TransportNetworkError, TransportTimeoutError, type HttpRequest, type HttpTransport } from "./transport.ts";
import type { PayPalConfig } from "./config.ts";

const config: PayPalConfig = {
  clientId: "cid-test",
  clientSecret: "csec-test",
  webhookId: "wh-test",
  environment: "sandbox",
};

function json(status: number, body: unknown): { status: number; ok: boolean; text: string } {
  return { status, ok: status >= 200 && status < 300, text: JSON.stringify(body) };
}

function api(handler: (request: HttpRequest) => { status: number; ok: boolean; text: string }) {
  const calls: HttpRequest[] = [];
  const transport: HttpTransport = async (request) => {
    calls.push(request);
    return handler(request);
  };
  return { calls, transport };
}

const tokenHandler = (request: HttpRequest) => {
  assert.match(request.url, /\/v1\/oauth2\/token$/);
  assert.equal(request.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(request.body, "grant_type=client_credentials");
  return json(200, { access_token: "tok-1", expires_in: 28800 });
};

const orderBody = (request: HttpRequest) => JSON.parse(request.body ?? "{}") as Record<string, unknown>;

// ---------------------------------------------------------------------------
// createAuthorizationHold
// ---------------------------------------------------------------------------

test("paypal: createAuthorizationHold sends a correct AUTHORIZE order and returns the approval URL", async () => {
  const { calls, transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, {
      id: "ORDER-1",
      status: "CREATED",
      links: [{ rel: "approve", href: "https://example.test/approve?token=abc" }],
    });
  });
  const provider = new PayPalSandboxProvider({ config, transport });

  const result = await provider.createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 12345,
    currency: "usd",
    requestId: "fairhold-auth-deal-1",
    returnUrl: "https://app.test/deal/deal-1",
    cancelUrl: "https://app.test/deal/deal-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.simulated, false);
  assert.equal(result.providerName, "paypal-sandbox");
  assert.equal(result.orderId, "ORDER-1");
  assert.equal(result.providerReference, "ORDER-1");
  assert.equal(result.approvalUrl, "https://example.test/approve?token=abc");
  assert.match(result.message, /hold/i);

  const orderCall = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!;
  assert.ok(orderCall);
  assert.equal(orderCall.headers["PayPal-Request-Id"], "fairhold-auth-deal-1");
  assert.equal(orderCall.headers.Authorization, "Bearer tok-1");
  const body = orderBody(orderCall);
  assert.equal(body.intent, "AUTHORIZE");
  const unit = (body.purchase_units as Record<string, unknown>[])[0];
  assert.equal((unit.amount as Record<string, unknown>).currency_code, "USD");
  assert.equal((unit.amount as Record<string, unknown>).value, "123.45");
  assert.equal(unit.custom_id, "deal-1");
  const ctx = (
    (body.payment_source as Record<string, unknown>).paypal as Record<string, unknown>
  ).experience_context as Record<string, unknown>;
  assert.equal(ctx.return_url, "https://app.test/deal/deal-1");
});

test("paypal: createAuthorizationHold fails on a malformed order response", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { status: "CREATED" }); // no id
  });
  const result = await new PayPalSandboxProvider({ config, transport }).createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 1000,
    currency: "USD",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.message, /PayPal/i);
});

test("paypal: createAuthorizationHold succeeds without an approval URL", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { id: "ORDER-1", status: "CREATED", links: [] });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 1000,
    currency: "USD",
  });
  assert.equal(result.ok, true);
  assert.equal(result.approvalUrl, null);
});

test("paypal: createAuthorizationHold rejects invalid currency and amount locally", async () => {
  const { transport } = api((request) => tokenHandler(request));
  const provider = new PayPalSandboxProvider({ config, transport });
  const badCurrency = await provider.createAuthorizationHold({
    dealId: "d", amountCents: 1000, currency: "US",
  });
  assert.equal(badCurrency.ok, false);
  assert.match(badCurrency.message, /[Cc]urrency/);
  const badAmount = await provider.createAuthorizationHold({
    dealId: "d", amountCents: 0, currency: "USD",
  });
  assert.equal(badAmount.ok, false);
  assert.match(badAmount.message, /[Aa]mount/);
});

test("paypal: OAuth failure is reported and never leaks the secret", async () => {
  const { transport } = api(() =>
    json(401, { name: "AUTH_ERROR", message: "Invalid client credentials" }),
  );
  const result = await new PayPalSandboxProvider({ config, transport }).createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 1000,
    currency: "USD",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.message, /PayPal authentication failed/);
  assert.doesNotMatch(result.message, /csec-test|cid-test/);
});

test("paypal: order creation timeout is a retry-safe failure with idempotency preserved", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    throw new TransportTimeoutError();
  });
  const result = await new PayPalSandboxProvider({ config, transport }).createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 1000,
    currency: "USD",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.message, /retry/i);
});

// ---------------------------------------------------------------------------
// authorizeOrder
// ---------------------------------------------------------------------------

test("paypal: authorizeOrder returns the authorization id", async () => {
  const { calls, transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, {
      id: "ORDER-1",
      status: "COMPLETED",
      purchase_units: [
        {
          payments: {
            authorizations: [{ id: "AUTH-9", status: "AUTHORIZED" }],
          },
        },
      ],
    });
  });
  const provider = new PayPalSandboxProvider({ config, transport });
  const result = await provider.authorizeOrder({ dealId: "deal-1", orderId: "ORDER-1" });

  assert.equal(result.ok, true);
  assert.equal(result.providerReference, "AUTH-9");
  assert.equal(result.orderId, "ORDER-1");
  assert.equal(result.status, "CREATED");
  assert.match(result.message, /hold/i);
  const call = calls.find((c) => c.url.endsWith("/v2/checkout/orders/ORDER-1/authorize"))!;
  assert.ok(call.headers["PayPal-Request-Id"]);
});

test("paypal: authorizeOrder reports a confirmed refusal", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(422, {
      name: "UNPROCESSABLE_ENTITY",
      details: [{ issue: "ORDER_NOT_APPROVED", description: "Buyer has not approved the order." }],
    });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).authorizeOrder({
    dealId: "deal-1",
    orderId: "ORDER-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.message, /ORDER_NOT_APPROVED/);
});

test("paypal: authorizeOrder timeout is PENDING, never retried blindly", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    throw new TransportTimeoutError();
  });
  const result = await new PayPalSandboxProvider({ config, transport }).authorizeOrder({
    dealId: "deal-1",
    orderId: "ORDER-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.match(result.message, /retry blindly/i);
});

test("paypal: authorizeOrder treats a PENDING authorization as an unconfirmed hold", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, {
      id: "ORDER-1",
      status: "COMPLETED",
      purchase_units: [
        { payments: { authorizations: [{ id: "AUTH-P", status: "PENDING" }] } },
      ],
    });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).authorizeOrder({
    dealId: "deal-1",
    orderId: "ORDER-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, "AUTH-P");
  assert.match(result.message, /unconfirmed/i);
  assert.match(result.message, /do not retry blindly/i);
});

test("paypal: authorizeOrder treats a DENIED authorization as failed", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, {
      id: "ORDER-1",
      status: "COMPLETED",
      purchase_units: [
        { payments: { authorizations: [{ id: "AUTH-D", status: "DENIED" }] } },
      ],
    });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).authorizeOrder({
    dealId: "deal-1",
    orderId: "ORDER-1",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.message, /DENIED/);
});

// ---------------------------------------------------------------------------
// captureAuthorization
// ---------------------------------------------------------------------------

test("paypal: captureAuthorization sends amount, invoice id and final_capture", async () => {
  const { calls, transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { id: "CAP-1", status: "COMPLETED" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    amountCents: 5000,
    currency: "USD",
    authorizationReference: "AUTH-9",
    invoiceId: "fairhold-ms-1",
    finalCapture: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerReference, "CAP-1");

  const call = calls.find((c) => c.url.endsWith("/v2/payments/authorizations/AUTH-9/capture"))!;
  const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
  assert.equal((body.amount as Record<string, unknown>).value, "50.00");
  assert.equal(body.invoice_id, "fairhold-ms-1");
  assert.equal(body.final_capture, true);
  assert.ok(call.headers["PayPal-Request-Id"]);
});

test("paypal: captureAuthorization rejects missing reference / bad amount locally", async () => {
  const { transport } = api((request) => tokenHandler(request));
  const provider = new PayPalSandboxProvider({ config, transport });
  const noRef = await provider.captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: null,
  });
  assert.equal(noRef.ok, false);
  assert.match(noRef.message, /[Nn]o authorization/);
  const badAmount = await provider.captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000.5, currency: "USD", authorizationReference: "A",
  });
  assert.equal(badAmount.ok, false);
});

test("paypal: captureAuthorization network ambiguity is PENDING", async () => {
  const transport: HttpTransport = async (request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    throw new TransportNetworkError("connection reset");
  };
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d",
    milestoneId: "m",
    amountCents: 1000,
    currency: "USD",
    authorizationReference: "A",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
});

test("paypal: captureAuthorization timeout is PENDING", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    throw new TransportTimeoutError();
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
});

test("paypal: captureAuthorization reports COMPLETED only with an explicit status and id", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { id: "CAP-1", status: "COMPLETED" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerReference, "CAP-1");
});

test("paypal: captureAuthorization treats an explicit PENDING as unsettled", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { id: "CAP-2", status: "PENDING" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, "CAP-2");
  assert.match(result.message, /unsettled/i);
  assert.match(result.message, /reconcil/i);
  assert.match(result.message, /do not retry blindly/i);
});

test("paypal: captureAuthorization treats PENDING without an id as unsettled", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { status: "PENDING" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, null);
});

test("paypal: captureAuthorization treats a missing status as PENDING (conservative)", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { id: "CAP-3" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, "CAP-3");
  assert.match(result.message, /no status field/i);
});

test("paypal: captureAuthorization treats COMPLETED without an id as PENDING", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { status: "COMPLETED" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, null);
  assert.match(result.message, /COMPLETED/);
  assert.match(result.message, /no capture id/i);
});

test("paypal: captureAuthorization reports a DECLINED capture as FAILED", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(200, { id: "CAP-4", status: "DECLINED" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
});

test("paypal: captureAuthorization treats an unknown status as PENDING", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(201, { id: "CAP-5", status: "SOMETHING_NEW" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).captureAuthorization({
    dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "PENDING");
  assert.equal(result.providerReference, "CAP-5");
  assert.match(result.message, /SOMETHING_NEW/);
});

// ---------------------------------------------------------------------------
// voidAuthorization
// ---------------------------------------------------------------------------

test("paypal: voidAuthorization handles 204 and reports VOIDED", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return { status: 204, ok: true, text: "" };
  });
  const result = await new PayPalSandboxProvider({ config, transport }).voidAuthorization({
    dealId: "d", milestoneId: "m", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "VOIDED");
});

test("paypal: voidAuthorization failure is not a refund story", async () => {
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    return json(409, { name: "ORDER_ALREADY_CAPTURED" });
  });
  const result = await new PayPalSandboxProvider({ config, transport }).voidAuthorization({
    dealId: "d", milestoneId: "m", authorizationReference: "AUTH-9",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
});

test("paypal: voidAuthorization rejects a missing reference before any request", async () => {
  const { calls, transport } = api((request) => tokenHandler(request));
  const result = await new PayPalSandboxProvider({ config, transport }).voidAuthorization({
    dealId: "d", milestoneId: "m", authorizationReference: null,
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// idempotency on every mutating call
// ---------------------------------------------------------------------------

test("paypal: PayPal-Request-Id is sent on create, authorize, capture and void", async () => {
  const { calls, transport } = api((request) => {
    if (request.url.endsWith("/token")) return tokenHandler(request);
    if (request.url.endsWith("/authorize")) {
      return json(201, { id: "ORDER-1", purchase_units: [{ payments: { authorizations: [{ id: "A", status: "AUTHORIZED" }] } }] });
    }
    if (request.url.endsWith("/capture")) return json(201, { id: "CAP", status: "COMPLETED" });
    if (request.url.endsWith("/void")) return { status: 204, ok: true, text: "" };
    return json(201, { id: "ORDER-1", links: [] });
  });
  const provider = new PayPalSandboxProvider({ config, transport });
  await provider.createAuthorizationHold({ dealId: "d", amountCents: 1000, currency: "USD" });
  await provider.authorizeOrder({ dealId: "d", orderId: "ORDER-1" });
  await provider.captureAuthorization({ dealId: "d", milestoneId: "m", amountCents: 1000, currency: "USD", authorizationReference: "A" });
  await provider.voidAuthorization({ dealId: "d", milestoneId: "m", authorizationReference: "B" });

  for (const path of ["/v2/checkout/orders", "/authorize", "/capture", "/void"]) {
    const mutating = calls.filter((c) => c.url.includes(path) && !c.url.endsWith("/token"));
    assert.ok(mutating.length > 0, `expected a call containing ${path}`);
    for (const call of mutating) {
      assert.ok(call.headers["PayPal-Request-Id"], `missing idempotency key on ${path}`);
    }
  }
});

test("paypal: access token is cached", async () => {
  let tokenRequests = 0;
  const { transport } = api((request) => {
    if (request.url.endsWith("/token")) {
      tokenRequests += 1;
      return tokenHandler(request);
    }
    return json(201, { id: "ORDER-1", links: [] });
  });
  const provider = new PayPalSandboxProvider({ config, transport });
  await provider.createAuthorizationHold({ dealId: "d", amountCents: 1000, currency: "USD" });
  await provider.createAuthorizationHold({ dealId: "d2", amountCents: 1000, currency: "USD" });
  assert.equal(tokenRequests, 1);
});

// ---------------------------------------------------------------------------
// webhooks
// ---------------------------------------------------------------------------

test("mapWebhookEvent: maps the supported event types and amounts", () => {
  const created = mapWebhookEvent({
    event_type: "PAYMENT.AUTHORIZATION.CREATED",
    resource: {
      id: "AUTH-1",
      amount: { currency_code: "USD", value: "123.45" },
      supplementary_data: { related_ids: { order_id: "ORDER-1" } },
    },
  });
  assert.equal(created.kind, "authorization_created");
  assert.equal(created.id, "AUTH-1");
  assert.equal(created.orderId, "ORDER-1");
  assert.equal(created.amountCents, 12345);
  assert.equal(created.currency, "USD");
  assert.equal(
    mapWebhookEvent({
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAP-1", invoice_id: "capture:deal:milestone" },
    }).correlationId,
    "capture:deal:milestone",
  );

  assert.equal(
    mapWebhookEvent({ event_type: "PAYMENT.AUTHORIZATION.VOIDED", resource: { id: "A" } }).kind,
    "authorization_voided",
  );
  assert.equal(
    mapWebhookEvent({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "C" } }).kind,
    "capture_completed",
  );
  assert.equal(
    mapWebhookEvent({ event_type: "PAYMENT.CAPTURE.PENDING", resource: {} }).kind,
    "capture_pending",
  );
  assert.equal(mapWebhookEvent({ event_type: "WHATEVER.ELSE", resource: {} }).kind, "unknown");
  assert.equal(mapWebhookEvent(null).kind, "unknown");
});

test("verifyWebhookSignature: true only on SUCCESS", async () => {
  const makeTransport = (status: string) =>
    api((request) => {
      if (request.url.endsWith("/token")) return tokenHandler(request);
      return json(200, { verification_status: status });
    }).transport;

  const input = {
    authAlgo: "SHA256withRSA",
    certUrl: "https://example.test/cert",
    transmissionId: "tid",
    transmissionSig: "sig",
    transmissionTime: "2026-01-01T00:00:00Z",
    event: { event_type: "PAYMENT.AUTHORIZATION.CREATED", resource: {} },
  };

  assert.equal(await verifyWebhookSignature(config, input, makeTransport("SUCCESS")), true);
  assert.equal(await verifyWebhookSignature(config, input, makeTransport("FAILURE")), false);
  assert.equal(
    await verifyWebhookSignature({ ...config, webhookId: null }, input, makeTransport("SUCCESS")),
    false,
  );
  assert.equal(
    await verifyWebhookSignature(
      config,
      { ...input, transmissionSig: null },
      makeTransport("SUCCESS"),
    ),
    false,
  );
});

test("verifyWebhookSignature: throws WebhookVerificationError on infra failures", async () => {
  const input = {
    authAlgo: "SHA256withRSA",
    certUrl: "https://example.test/cert",
    transmissionId: "tid",
    transmissionSig: "sig",
    transmissionTime: "2026-01-01T00:00:00Z",
    event: { event_type: "PAYMENT.AUTHORIZATION.CREATED", resource: {} },
  };

  // Token request transport failure → infra error.
  await assert.rejects(
    verifyWebhookSignature(
      config,
      input,
      api(() => {
        throw new TransportTimeoutError();
      }).transport,
    ),
    WebhookVerificationError,
  );

  // Token endpoint returns a non-2xx → infra error.
  await assert.rejects(
    verifyWebhookSignature(
      config,
      input,
      api(() => json(500, { message: "boom" })).transport,
    ),
    WebhookVerificationError,
  );

  // Verify postback transport failure → infra error.
  await assert.rejects(
    verifyWebhookSignature(
      config,
      input,
      api((request) => {
        if (request.url.endsWith("/token")) return tokenHandler(request);
        throw new TransportTimeoutError();
      }).transport,
    ),
    WebhookVerificationError,
  );

  // Verify endpoint returns a non-2xx → infra error.
  await assert.rejects(
    verifyWebhookSignature(
      config,
      input,
      api((request) => {
        if (request.url.endsWith("/token")) return tokenHandler(request);
        return json(500, { message: "boom" });
      }).transport,
    ),
    WebhookVerificationError,
  );

  // A clean FAILURE response is still a definitive false, not an error.
  const ok = await verifyWebhookSignature(
    config,
    input,
    api((request) => {
      if (request.url.endsWith("/token")) return tokenHandler(request);
      return json(200, { verification_status: "FAILURE" });
    }).transport,
  );
  assert.equal(ok, false);
});

// ---------------------------------------------------------------------------
// configuration and selection
// ---------------------------------------------------------------------------

test("config: sandbox requires real-looking credentials", () => {
  assert.equal(readPayPalConfig({}), null);
  assert.equal(readPayPalConfig({ PAYPAL_ENV: "live", PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" }), null);
  assert.equal(
    readPayPalConfig({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "your_client_id", PAYPAL_CLIENT_SECRET: "b" }),
    null,
  );
  const ok = readPayPalConfig({
    PAYPAL_ENV: "sandbox",
    PAYPAL_CLIENT_ID: "cid",
    PAYPAL_CLIENT_SECRET: "csec",
  });
  assert.equal(ok?.environment, "sandbox");
  assert.equal(ok?.webhookId, null);
});

test("selection: sandbox provider only when configured, demo otherwise", () => {
  assert.equal(getPaymentProvider({}).mode, "demo");
  assert.equal(
    getPaymentProvider({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "cid", PAYPAL_CLIENT_SECRET: "csec" }).mode,
    "sandbox",
  );
});