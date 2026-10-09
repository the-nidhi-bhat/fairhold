/**
 * Payment provider adapter.
 *
 * All payment operations live behind this interface, server-side only. The app
 * must never call PayPal directly from a component or action; it calls a
 * provider. The current implementation is the demo provider (no network). A
 * PayPal sandbox adapter can be added later without touching the domain,
 * actions, or UI.
 *
 * Authorization is the only operation modeled so far because that is the only
 * one the app currently needs. Capture/void/release will be added to this
 * interface when their milestones are built.
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

export type PaymentProviderMode = "demo" | "sandbox" | "live";

export interface PaymentProvider {
  readonly name: string;
  readonly mode: PaymentProviderMode;
  createAuthorizationHold(
    request: AuthorizationRequest,
  ): Promise<AuthorizationResult>;
}
