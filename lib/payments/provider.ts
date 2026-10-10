/**
 * Payment provider adapter.
 *
 * All payment operations live behind this interface, server-side only. The app
 * must never call PayPal directly from a component or action; it calls a
 * provider. The current implementation is the demo provider (no network). A
 * PayPal sandbox adapter can be added later without touching the domain,
 * actions, or UI.
 *
 * Operations modeled: create an authorization hold, capture against it, and
 * void the remaining hold. Capture and void are deliberately separate — void is
 * NOT a refund. A refund operation is intentionally not modeled yet.
 */

export interface AuthorizationRequest {
  dealId: string;
  amountCents: number;
  currency: string;
}

export interface AuthorizationResult {
  ok: boolean;
  /** True when no external payment network was contacted. */
  simulated: boolean;
  providerName: string;
  providerReference: string | null;
  status: "CREATED" | "FAILED";
  message: string;
}

export interface CaptureRequest {
  dealId: string;
  milestoneId: string;
  amountCents: number;
  currency: string;
  /** Reference of the authorization hold this capture applies to, if known. */
  authorizationReference: string | null;
}

export interface VoidRequest {
  dealId: string;
  milestoneId: string;
  /** Reference of the authorization hold to cancel; required. */
  authorizationReference: string | null;
}

export type PaymentOperationStatus = "COMPLETED" | "VOIDED" | "FAILED";

/**
 * Result of a capture or void. `simulated` distinguishes a demo result from a
 * real provider result, and `status` is "FAILED" when the provider refused an
 * invalid request rather than performing the operation.
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
  captureAuthorization(
    request: CaptureRequest,
  ): Promise<PaymentOperationResult>;
  voidAuthorization(request: VoidRequest): Promise<PaymentOperationResult>;
}
