import { test } from "node:test";
import assert from "node:assert/strict";
import { getPaymentProvider } from "./demo.ts";

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
