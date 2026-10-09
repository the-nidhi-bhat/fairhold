/**
 * Demo payment provider.
 *
 * Makes no network calls and contacts no payment service. Every result is
 * flagged `simulated: true` so the UI and audit trail can state plainly that no
 * PayPal authorization occurred. This exists only so the deal flow can be
 * exercised end-to-end before the real sandbox adapter is wired in.
 */
import { randomUUID } from "node:crypto";
import type {
  AuthorizationRequest,
  AuthorizationResult,
  PaymentProvider,
} from "./provider";

export class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo-payment-provider";
  readonly mode = "demo" as const;

  async createAuthorizationHold(
    request: AuthorizationRequest,
  ): Promise<AuthorizationResult> {
    const amount = (request.amountCents / 100).toFixed(2);
    return {
      ok: true,
      simulated: true,
      providerName: this.name,
      providerReference: `demo-auth-${randomUUID()}`,
      status: "CREATED",
      message: `SIMULATED: no PayPal request was made (${request.currency} ${amount}).`,
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return new DemoPaymentProvider();
}
