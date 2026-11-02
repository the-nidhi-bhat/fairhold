import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handlePaypalWebhookRequest,
  WEBHOOK_MAX_BODY_CHARS,
} from "./webhook-endpoint.ts";
import { WebhookVerificationError } from "./paypal.ts";
import type { PayPalConfig } from "./config.ts";

const config: PayPalConfig = {
  clientId: "cid-test",
  clientSecret: "csec-test",
  webhookId: "wh-test",
  environment: "sandbox",
};

const validPayload = {
  id: "WH-123",
  event_type: "PAYMENT.AUTHORIZATION.CREATED",
  resource: { id: "AUTH-1", amount: { currency_code: "USD", value: "10.00" } },
};

function webhookRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://app.test/api/paypal/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://example.test/cert",
      "paypal-transmission-id": "tid-1",
      "paypal-transmission-sig": "sig-1",
      "paypal-transmission-time": "2026-01-01T00:00:00Z",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const okOutcome = { outcome: "processed" } as const;

test("webhook endpoint: unconfigured PayPal returns 503, never 200", async () => {
  for (const c of [null, { ...config, webhookId: null }]) {
    const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
      config: c,
    });
    assert.equal(res.status, 503);
  }
});

test("webhook endpoint: JSON dev backend returns 503 (webhooks need PostgreSQL)", async () => {
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "json",
  });
  assert.equal(res.status, 503);
});

test("webhook endpoint: missing transmission headers return 400", async () => {
  const missing = webhookRequest(validPayload, {
    "paypal-transmission-id": "",
  });
  const res = await handlePaypalWebhookRequest(missing, {
    config,
    backend: "postgres",
    verifySignature: async () => true,
    processEvent: async () => okOutcome,
  });
  assert.equal(res.status, 400);
});

test("webhook endpoint: oversized body returns 413", async () => {
  const huge = "x".repeat(WEBHOOK_MAX_BODY_CHARS + 1);
  const res = await handlePaypalWebhookRequest(
    webhookRequest(huge, {}),
    {
      config,
      backend: "postgres",
      verifySignature: async () => true,
      processEvent: async () => okOutcome,
    },
  );
  assert.equal(res.status, 413);
});

test("webhook endpoint: malformed JSON returns 400", async () => {
  const res = await handlePaypalWebhookRequest(
    new Request("https://app.test/api/paypal/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "paypal-auth-algo": "a",
        "paypal-cert-url": "b",
        "paypal-transmission-id": "c",
        "paypal-transmission-sig": "d",
        "paypal-transmission-time": "e",
      },
      body: "{not json",
    }),
    {
      config,
      backend: "postgres",
      verifySignature: async () => true,
      processEvent: async () => okOutcome,
    },
  );
  assert.equal(res.status, 400);
});

test("webhook endpoint: payload without an event id returns 400", async () => {
  const res = await handlePaypalWebhookRequest(
    webhookRequest({ event_type: "PAYMENT.AUTHORIZATION.CREATED" }),
    {
      config,
      backend: "postgres",
      verifySignature: async () => true,
      processEvent: async () => okOutcome,
    },
  );
  assert.equal(res.status, 400);
});

test("webhook endpoint: rejected signature returns 400", async () => {
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "postgres",
    verifySignature: async () => false,
    processEvent: async () => okOutcome,
  });
  assert.equal(res.status, 400);
});

test("webhook endpoint: verification infrastructure failure returns 500 (PayPal retries)", async () => {
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "postgres",
    verifySignature: async () => {
      throw new WebhookVerificationError();
    },
    processEvent: async () => okOutcome,
  });
  assert.equal(res.status, 500);
});

test("webhook endpoint: database processing failure returns 500 (PayPal retries)", async () => {
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "postgres",
    verifySignature: async () => true,
    processEvent: async () => {
      throw new Error("connection refused");
    },
  });
  assert.equal(res.status, 500);
});

test("webhook endpoint: passes headers + parsed payload to the signature verifier", async () => {
  let seen: unknown;
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "postgres",
    verifySignature: async (input) => {
      seen = input;
      return true;
    },
    processEvent: async () => okOutcome,
  });
  assert.equal(res.status, 200);
  const input = seen as {
    authAlgo: string;
    transmissionId: string;
    event: unknown;
  };
  assert.equal(input.authAlgo, "SHA256withRSA");
  assert.equal(input.transmissionId, "tid-1");
  assert.deepEqual(input.event, validPayload);
});

test("webhook endpoint: processed event returns 200 with the outcome", async () => {
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "postgres",
    verifySignature: async () => true,
    processEvent: async () => okOutcome,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true, outcome: "processed" });
});

test("webhook endpoint: quarantined event still acknowledges with 200", async () => {
  const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
    config,
    backend: "postgres",
    verifySignature: async () => true,
    processEvent: async () => ({
      outcome: "quarantined",
      reason: "unknown order id",
    }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true, outcome: "quarantined" });
});

test("webhook endpoint: duplicate and unsupported outcomes also acknowledge with 200", async () => {
  for (const outcome of [
    { outcome: "duplicate" },
    { outcome: "unsupported", reason: "unsupported event type" },
  ] as const) {
    const res = await handlePaypalWebhookRequest(webhookRequest(validPayload), {
      config,
      backend: "postgres",
      verifySignature: async () => true,
      processEvent: async () => outcome,
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { outcome: string };
    assert.equal(body.outcome, outcome.outcome);
  }
});