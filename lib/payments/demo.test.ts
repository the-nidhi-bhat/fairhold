import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoPaymentProvider } from "./demo.ts";

const getPaymentProvider = () => new DemoPaymentProvider();

test("demo provider: simulates an authorization with no network call", async () => {
  const provider = getPaymentProvider();
  assert.equal(provider.mode, "demo");

  const result = await provider.createAuthorizationHold({
    dealId: "deal-1",
    amountCents: 9000,
    currency: "USD",
  });

  assert.equal(result.ok, true);
  assert.equal(result.simulated, true);
  assert.equal(result.status, "CREATED");
  assert.ok(result.providerReference?.startsWith("demo-auth-"));
  assert.match(result.message, /SIMULATED/);
});

test("demo provider: capture is simulated and rejects bad amounts", async () => {
  const provider = getPaymentProvider();

  const ok = await provider.captureAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    amountCents: 1000,
    currency: "USD",
    authorizationReference: "demo-auth-1",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.simulated, true);
  assert.equal(ok.status, "COMPLETED");
  assert.ok(ok.providerReference?.startsWith("demo-capture-"));
  assert.match(ok.message, /SIMULATED/);

  const bad = await provider.captureAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    amountCents: 0,
    currency: "USD",
    authorizationReference: "demo-auth-1",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, "FAILED");
});

test("demo provider: void is simulated and requires an authorization", async () => {
  const provider = getPaymentProvider();

  const ok = await provider.voidAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    authorizationReference: "demo-auth-1",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.status, "VOIDED");
  assert.ok(ok.providerReference?.startsWith("demo-void-"));
  assert.match(ok.message, /SIMULATED/);

  const bad = await provider.voidAuthorization({
    dealId: "deal-1",
    milestoneId: "ms-1",
    authorizationReference: null,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, "FAILED");
});

test("demo provider: authorizeOrder is simulated and needs no buyer step", async () => {
  const provider = getPaymentProvider();
  const result = await provider.authorizeOrder({ dealId: "deal-1", orderId: "demo-order-1" });
  assert.equal(result.ok, true);
  assert.equal(result.simulated, true);
  assert.equal(result.orderId, "demo-order-1");
  assert.ok(result.providerReference?.startsWith("demo-auth-"));
});
