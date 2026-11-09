/**
 * Payment provider adapter.
 *
 * All payment operations live behind this interface, server-side only. The app
 * must never call PayPal directly from a component or action; it calls a
 * provider. Two implementations exist: a demo provider (no network, simulated)
 * and a PayPal *sandbox* adapter. The provider is selected by configuration;
 * the app never silently switches a started real operation to simulated.
 *
 * Operations modeled: create an authorization hold, authorize an approved
 * order, capture against the resulting authorization, and void the remaining
 * authorization. Capture and void are deliberately separate — void is NOT a
 * refund and a refund is intentionally not modeled.
 *
 * Nothing here proves money moved: an authorization is a hold, not a capture or
 * a settlement. `simulated` distinguishes a demo result from a real provider
 * result; `status` of "PENDING" means the outcome is ambiguous (for example a
 * timeout) and a possibly-successful financial request must not be repeated.
 */

export interface AuthorizationRequest {
  dealId: string;
  amountCents: number;
  currency: string;
  /** Idempotency key. Reusing it makes a retried create return the same order. */
  requestId?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface AuthorizationResult {
  ok: boolean;
  /** True when no external payment network was contacted. */
  simulated: boolean;
  providerName: string;
  /** Provider order id (used later to authorize or reconcile). */
  providerReference: string | null;
  orderId: string | null;
  /** Buyer approval URL when the provider requires a buyer step. */
  approvalUrl: string | null;
  status: "CREATED" | "FAILED";
  message: string;
  /**
   * ISO expiry the provider reported for the hold, when it reports one at this
   * step. Only the demo provider supplies it here (flagged `simulated`).
   */
  expiresAt?: string | null;
}

export interface AuthorizeOrderRequest {
  dealId: string;
  /** Provider order id returned by createAuthorizationHold. Required. */
  orderId: string;
  requestId?: string;
}

export interface AuthorizeOrderResult {
  ok: boolean;
  simulated: boolean;
  providerName: string;
  /** Provider authorization id (the hold) when successful. */
  providerReference: string | null;
  orderId: string;
  status: "CREATED" | "PENDING" | "FAILED";
  message: string;
  /**
   * ISO expiry of the authorization hold, taken from PayPal's
   * `expiration_time` when present. Null when the provider did not report one.
   */
  expiresAt?: string | null;
}

export interface CaptureRequest {
  dealId: string;
  milestoneId: string;
  amountCents: number;
  currency: string;
  /** Id of the authorization hold this capture applies to. Required. */
  authorizationReference: string | null;
  finalCapture?: boolean;
  /** Unique invoice id for this capture (PayPal rejects a duplicate). */
  invoiceId?: string;
  requestId?: string;
}

export interface VoidRequest {
  dealId: string;
  milestoneId: string;
  /** Id of the authorization hold to cancel; required. */
  authorizationReference: string | null;
  requestId?: string;
}

export type PaymentOperationStatus = "COMPLETED" | "VOIDED" | "PENDING" | "FAILED";

/**
 * Result of a capture or void. `simulated` distinguishes a demo result from a
 * real provider result.
 *
 * Status contract (the adapter enforces this, it is not just advisory):
 *  - "COMPLETED": settled money. A real provider must have explicitly reported
 *    success AND returned a usable reference; a 2xx response alone is not
 *    enough.
 *  - "PENDING": the request was accepted but the outcome is not settled — a
 *    timeout, an explicit PENDING, or a missing/unknown/unexpected provider
 *    status (treated conservatively). Reconcile against the provider before
 *    acting; never retry blindly.
 *  - "FAILED": a definite refusal/decline. No money moved.
 *  - "VOIDED": an authorization hold was released. This is NOT a refund.
 *
 * `ok` is true only for "COMPLETED" and "VOIDED".
 */
export interface PaymentOperationResult {
  ok: boolean;
  simulated: boolean;
  providerName: string;
  providerReference: string | null;
  status: PaymentOperationStatus;
  message: string;
}

export type PaymentProviderMode = "demo" | "sandbox" | "live";

export interface PaymentProvider {
  readonly name: string;
  readonly mode: PaymentProviderMode;
  createAuthorizationHold(
    request: AuthorizationRequest,
  ): Promise<AuthorizationResult>;
  authorizeOrder(request: AuthorizeOrderRequest): Promise<AuthorizeOrderResult>;
  captureAuthorization(
    request: CaptureRequest,
  ): Promise<PaymentOperationResult>;
  voidAuthorization(request: VoidRequest): Promise<PaymentOperationResult>;
}
