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
  AuthorizeOrderRequest,
  AuthorizeOrderResult,
  CaptureRequest,
  PaymentOperationResult,
  PaymentProvider,
  VoidRequest,
} from "./provider.ts";

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
      orderId: null,
      approvalUrl: null,
      status: "CREATED",
      message: `SIMULATED: no PayPal request was made (${request.currency} ${amount}).`,
    };
  }

  async authorizeOrder(
    request: AuthorizeOrderRequest,
  ): Promise<AuthorizeOrderResult> {
    return {
      ok: true,
      simulated: true,
      providerName: this.name,
      providerReference: `demo-auth-${randomUUID()}`,
      orderId: request.orderId,
      status: "CREATED",
      message:
        "SIMULATED: no PayPal request was made (the demo provider needs no buyer approval step).",
    };
  }

  async captureAuthorization(
    request: CaptureRequest,
  ): Promise<PaymentOperationResult> {
    if (!Number.isSafeInteger(request.amountCents) || request.amountCents <= 0) {
      return this.failure(
        "Refusing capture: the amount must be a positive integer number of cents.",
      );
    }
    const amount = (request.amountCents / 100).toFixed(2);
    return {
      ok: true,
      simulated: true,
      providerName: this.name,
      // Deterministic per request so a retried capture returns the same
      // reference instead of double-counting a second simulated capture.
      providerReference: `demo-capture-${request.requestId ?? randomUUID()}`,
      status: "COMPLETED",
      message: `SIMULATED: no PayPal request was made (captured ${request.currency} ${amount}).`,
    };
  }

  async voidAuthorization(
    request: VoidRequest,
  ): Promise<PaymentOperationResult> {
    if (!request.authorizationReference) {
      return this.failure(
        "Refusing void: no authorization reference was provided.",
      );
    }
    return {
      ok: true,
      simulated: true,
      providerName: this.name,
      providerReference: `demo-void-${request.requestId ?? randomUUID()}`,
      status: "VOIDED",
      message:
        "SIMULATED: no PayPal request was made (the remaining hold was voided).",
    };
  }

  private failure(message: string): PaymentOperationResult {
    return {
      ok: false,
      simulated: true,
      providerName: this.name,
      providerReference: null,
      status: "FAILED",
      message,
    };
  }
}
