/**
 * PayPal *sandbox* payment adapter.
 *
 * This is the only module that talks to PayPal. It is server-side only. It
 * implements the PaymentProvider interface plus webhook signature verification
 * helpers. Endpoints and payloads follow the official PayPal REST specs:
 *
 *   POST /v1/oauth2/token
 *   POST /v2/checkout/orders                         (intent AUTHORIZE)
 *   POST /v2/checkout/orders/{id}/authorize
 *   POST /v2/payments/authorizations/{id}/capture    (final_capture, invoice_id)
 *   POST /v2/payments/authorizations/{id}/void
 *   POST /v1/notifications/verify-webhook-signature
 *
 * Safety rules baked in here:
 *  - An authorization is a HOLD; this adapter never claims captured/settled
 *    money. Capture and void are explicit, separate operations.
 *  - Idempotency keys are sent as `PayPal-Request-Id` on every mutating call.
 *  - A timeout is reported as "PENDING" (ambiguous), never retried blindly.
 *  - Missing/garbage authorization ids are rejected before any request.
 *  - Access tokens and secrets are never logged or returned.
 */

import {
  createFetchTransport,
  TransportNetworkError,
  TransportTimeoutError,
  type HttpTransport,
} from "./transport.ts";
import type { PayPalConfig } from "./config.ts";
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

const SANDBOX_API = "https://api-m.sandbox.paypal.com";
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 3_000_000;
const MAX_ERROR_TEXT = 200;
const MAX_STATUS_TEXT = 40;

interface TokenCache {
  value: string;
  expiresAt: number;
}

interface CallResult {
  status: number;
  ok: boolean;
  data: Record<string, unknown> | null;
  /** Set when the request never completed (network/timeout). */
  transportError: "timeout" | "network" | null;
}

function isValidCurrency(currency: string): boolean {
  return /^[A-Za-z]{3}$/.test(currency);
}

function isValidAmountCents(cents: number): boolean {
  return Number.isSafeInteger(cents) && cents > 0;
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function requestId(prefix: string, seed?: string): string {
  const suffix =
    seed ?? globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${suffix}`.slice(0, 100);
}

/** Pull a short, safe description out of a PayPal error body. */
function describeError(data: Record<string, unknown> | null, fallback: string): string {
  if (!data) return fallback;
  const pieces: string[] = [];
  const name = typeof data.name === "string" ? data.name : null;
  const message = typeof data.message === "string" ? data.message : null;
  if (name) pieces.push(name);
  if (message) pieces.push(message);
  const details = Array.isArray(data.details) ? data.details : [];
  for (const detail of details.slice(0, 3)) {
    if (detail && typeof detail === "object") {
      const issue = (detail as Record<string, unknown>).issue;
      const desc = (detail as Record<string, unknown>).description;
      if (typeof issue === "string") pieces.push(issue);
      else if (typeof desc === "string") pieces.push(desc);
    }
  }
  const text = pieces.join(": ").trim();
  return (text || fallback).slice(0, MAX_ERROR_TEXT);
}

/**
 * Render an untrusted provider status value for a human message. Only a short
 * alphanumeric token survives, so no arbitrary payload text (or secret) reaches
 * the caller. Never treat the result as a success signal.
 */
function describeProviderStatus(raw: unknown): string {
  if (raw === undefined) return "no status field";
  if (typeof raw !== "string") return `a non-string status (${typeof raw})`;
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_STATUS_TEXT);
  if (!cleaned) return "an empty status";
  return `status "${cleaned}"`;
}

export interface PayPalSandboxProviderOptions {
  config: PayPalConfig;
  transport?: HttpTransport;
  now?: () => number;
}

export class PayPalSandboxProvider implements PaymentProvider {
  readonly name = "paypal-sandbox";
  readonly mode = "sandbox" as const;

  private readonly config: PayPalConfig;
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private tokenCache: TokenCache | null = null;

  constructor(options: PayPalSandboxProviderOptions) {
    this.config = options.config;
    this.transport = options.transport ?? createFetchTransport();
    this.now = options.now ?? (() => Date.now());
  }

  private async call(
    path: string,
    init: {
      method?: "GET" | "POST";
      body?: unknown;
      requestId?: string;
      token?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<CallResult> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;

    let response;
    try {
      response = await this.transport({
        method: init.method ?? "POST",
        url: `${SANDBOX_API}${path}`,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        timeoutMs: init.timeoutMs,
      });
    } catch (error) {
      if (error instanceof TransportTimeoutError) {
        return { status: 0, ok: false, data: null, transportError: "timeout" };
      }
      if (error instanceof TransportNetworkError) {
        return { status: 0, ok: false, data: null, transportError: "network" };
      }
      return { status: 0, ok: false, data: null, transportError: "network" };
    }

    let data: Record<string, unknown> | null = null;
    if (response.text) {
      try {
        const parsed = JSON.parse(response.text);
        if (parsed && typeof parsed === "object") {
          data = parsed as Record<string, unknown>;
        }
      } catch {
        data = null;
      }
    }
    return { status: response.status, ok: response.ok, data, transportError: null };
  }

  private async getAccessToken(): Promise<string> {
    const now = this.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return this.tokenCache.value;
    }
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");
    // The token endpoint wants form encoding, not JSON, so it bypasses call().
    const response = await (async () => {
      try {
        return await this.transport({
          method: "POST",
          url: `${SANDBOX_API}/v1/oauth2/token`,
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: "grant_type=client_credentials",
        });
      } catch (error) {
        if (error instanceof TransportTimeoutError) {
          throw new Error("PayPal authentication timed out.");
        }
        throw new Error("PayPal authentication request failed.");
      }
    })();

    let data: Record<string, unknown> | null = null;
    try {
      data = response.text ? (JSON.parse(response.text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }

    if (!response.ok || !data || typeof data.access_token !== "string") {
      throw new Error(
        `PayPal authentication failed: ${describeError(data, `HTTP ${response.status}`)}`,
      );
    }
    const expiresIn =
      typeof data.expires_in === "number" && data.expires_in > 0
        ? data.expires_in * 1000
        : DEFAULT_TOKEN_TTL_MS;
    this.tokenCache = {
      value: data.access_token,
      expiresAt: now + Math.max(expiresIn - TOKEN_SAFETY_MARGIN_MS, 30_000),
    };
    return data.access_token;
  }

  async createAuthorizationHold(
    request: AuthorizationRequest,
  ): Promise<AuthorizationResult> {
    const base: Pick<AuthorizationResult, "simulated" | "providerName"> = {
      simulated: false,
      providerName: this.name,
    };

    if (!isValidCurrency(request.currency)) {
      return { ...base, ok: false, providerReference: null, orderId: null, approvalUrl: null, status: "FAILED", message: "Invalid currency code." };
    }
    if (!isValidAmountCents(request.amountCents)) {
      return { ...base, ok: false, providerReference: null, orderId: null, approvalUrl: null, status: "FAILED", message: "Invalid amount." };
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      return { ...base, ok: false, providerReference: null, orderId: null, approvalUrl: null, status: "FAILED", message: (error as Error).message };
    }

    const body = {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: request.dealId,
          amount: {
            currency_code: request.currency.toUpperCase(),
            value: formatAmount(request.amountCents),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: request.returnUrl,
            cancel_url: request.cancelUrl,
            user_action: "CONTINUE",
          },
        },
      },
    };

    const result = await this.call("/v2/checkout/orders", {
      token,
      body,
      requestId: request.requestId ?? requestId("fairhold-auth", request.dealId),
    });

    if (result.transportError === "timeout") {
      return {
        ...base,
        ok: false,
        providerReference: null,
        orderId: null,
        approvalUrl: null,
        status: "FAILED",
        message:
          "PayPal order creation timed out. This is safe to retry with the same idempotency key; no financial operation occurred.",
      };
    }
    if (result.transportError) {
      return { ...base, ok: false, providerReference: null, orderId: null, approvalUrl: null, status: "FAILED", message: "Could not reach PayPal." };
    }
    if (!result.ok || !result.data || typeof result.data.id !== "string") {
      return {
        ...base,
        ok: false,
        providerReference: null,
        orderId: null,
        approvalUrl: null,
        status: "FAILED",
        message: describeError(result.data, `PayPal rejected the order (HTTP ${result.status}).`),
      };
    }

    const orderId = result.data.id;
    const approvalUrl = extractApprovalUrl(result.data);
    return {
      ...base,
      ok: true,
      providerReference: orderId,
      orderId,
      approvalUrl,
      status: "CREATED",
      message: approvalUrl
        ? "Sandbox authorization order created. The buyer must approve it in PayPal before the hold can be authorized; no money has moved."
        : "Sandbox authorization order created, but PayPal did not return an approval URL.",
    };
  }

  async authorizeOrder(
    request: AuthorizeOrderRequest,
  ): Promise<AuthorizeOrderResult> {
    const base = { simulated: false, providerName: this.name, orderId: request.orderId };
    if (!request.orderId) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "Missing order id." };
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: (error as Error).message };
    }

    const result = await this.call(
      `/v2/checkout/orders/${encodeURIComponent(request.orderId)}/authorize`,
      { token, body: {}, requestId: request.requestId ?? requestId("fairhold-confirm", request.orderId) },
    );

    if (result.transportError === "timeout") {
      return {
        ...base,
        ok: false,
        providerReference: null,
        status: "PENDING",
        message:
          "Authorization attempt timed out and the outcome is unknown. Do not retry blindly — check the order in PayPal before trying again.",
      };
    }
    if (result.transportError) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "Could not reach PayPal." };
    }
    if (!result.ok) {
      return {
        ...base,
        ok: false,
        providerReference: null,
        status: "FAILED",
        message: describeError(result.data, "PayPal did not authorize the order (buyer may not have approved it yet)."),
      };
    }

    const authorization = extractAuthorization(result.data);
    if (!authorization.id) {
      return {
        ...base,
        ok: false,
        providerReference: null,
        status: "FAILED",
        message: "PayPal responded without an authorization id.",
      };
    }
    // A 2xx only means the request was accepted. The hold exists only when
    // PayPal reports the authorization resource itself as CREATED/AUTHORIZED.
    if (authorization.status === "CREATED" || authorization.status === "AUTHORIZED") {
      return {
        ...base,
        ok: true,
        providerReference: authorization.id,
        status: "CREATED",
        message: "Sandbox authorization hold created. This is a hold, not a capture or a settlement.",
      };
    }
    if (
      authorization.status === "DENIED" ||
      authorization.status === "DECLINED" ||
      authorization.status === "FAILED" ||
      authorization.status === "VOIDED" ||
      authorization.status === "EXPIRED"
    ) {
      return {
        ...base,
        ok: false,
        providerReference: authorization.id,
        status: "FAILED",
        message: `PayPal did not create the authorization hold (reported ${describeProviderStatus(authorization.status)}).`,
      };
    }
    // PENDING, or any missing/unknown status, is accepted-but-unconfirmed.
    return {
      ...base,
      ok: false,
      providerReference: authorization.id,
      status: "PENDING",
      message: `PayPal accepted the authorization request but reported ${describeProviderStatus(authorization.status)}, so the hold is unconfirmed. Reconcile against PayPal before retrying; do not retry blindly.`,
    };
  }

  async captureAuthorization(
    request: CaptureRequest,
  ): Promise<PaymentOperationResult> {
    const base: Pick<PaymentOperationResult, "simulated" | "providerName"> = {
      simulated: false,
      providerName: this.name,
    };
    if (!request.authorizationReference) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "No authorization to capture against." };
    }
    if (!isValidCurrency(request.currency)) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "Invalid currency code." };
    }
    if (!isValidAmountCents(request.amountCents)) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "Invalid amount." };
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: (error as Error).message };
    }

    const body: Record<string, unknown> = {
      amount: {
        currency_code: request.currency.toUpperCase(),
        value: formatAmount(request.amountCents),
      },
      final_capture: request.finalCapture ?? false,
    };
    if (request.invoiceId) body.invoice_id = request.invoiceId;

    const result = await this.call(
      `/v2/payments/authorizations/${encodeURIComponent(request.authorizationReference)}/capture`,
      {
        token,
        body,
        requestId: request.requestId ?? requestId("fairhold-capture", request.milestoneId),
      },
    );

    if (result.transportError === "timeout") {
      return { ...base, ok: false, providerReference: null, status: "PENDING", message: "Capture outcome is unknown (timeout). Do not retry blindly — reconcile against PayPal first." };
    }
    if (result.transportError) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "Could not reach PayPal." };
    }
    if (!result.ok) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: describeError(result.data, "PayPal did not capture the authorization.") };
    }

    // A 2xx means PayPal accepted the request, NOT that money settled. Only an
    // explicit COMPLETED with a capture id is settled money; everything else is
    // reported conservatively.
    const data = result.data;
    const captureId =
      data && typeof data.id === "string" && data.id.trim() !== "" ? data.id : null;
    const rawStatus = data ? data.status : undefined;

    if (rawStatus === "COMPLETED" && captureId) {
      return {
        ...base,
        ok: true,
        providerReference: captureId,
        status: "COMPLETED",
        message: "PayPal sandbox reported the capture as completed.",
      };
    }
    if (rawStatus === "DECLINED" || rawStatus === "FAILED") {
      return {
        ...base,
        ok: false,
        providerReference: captureId,
        status: "FAILED",
        message: `PayPal sandbox reported the capture as ${rawStatus}. No money moved.`,
      };
    }

    const detail =
      rawStatus === "COMPLETED"
        ? "reported it as COMPLETED but returned no capture id"
        : `reported ${describeProviderStatus(rawStatus)}`;
    return {
      ...base,
      ok: false,
      providerReference: captureId,
      status: "PENDING",
      message: `PayPal accepted the capture request but ${detail}. This capture is unsettled: reconcile it against PayPal and do not retry blindly.`,
    };
  }

  async voidAuthorization(request: VoidRequest): Promise<PaymentOperationResult> {
    const base: Pick<PaymentOperationResult, "simulated" | "providerName"> = {
      simulated: false,
      providerName: this.name,
    };
    if (!request.authorizationReference) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "No authorization to void." };
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: (error as Error).message };
    }

    const result = await this.call(
      `/v2/payments/authorizations/${encodeURIComponent(request.authorizationReference)}/void`,
      { token, body: {}, requestId: request.requestId ?? requestId("fairhold-void", request.milestoneId) },
    );

    if (result.transportError === "timeout") {
      return { ...base, ok: false, providerReference: null, status: "PENDING", message: "Void outcome is unknown (timeout). Do not retry blindly — reconcile against PayPal first." };
    }
    if (result.transportError) {
      return { ...base, ok: false, providerReference: null, status: "FAILED", message: "Could not reach PayPal." };
    }
    // PayPal returns 204 (no body) or 200 on a successful void.
    if (result.status === 204 || result.ok) {
      return {
        ...base,
        ok: true,
        providerReference: request.authorizationReference,
        status: "VOIDED",
        message: "PayPal sandbox reported the authorization as voided. This is not a refund.",
      };
    }
    return { ...base, ok: false, providerReference: null, status: "FAILED", message: describeError(result.data, "PayPal did not void the authorization.") };
  }
}

function extractApprovalUrl(order: Record<string, unknown>): string | null {
  const links = Array.isArray(order.links) ? order.links : [];
  for (const link of links) {
    if (!link || typeof link !== "object") continue;
    const rel = (link as Record<string, unknown>).rel;
    const href = (link as Record<string, unknown>).href;
    if ((rel === "approve" || rel === "payer-action") && typeof href === "string") {
      return href;
    }
  }
  return null;
}

interface ExtractedAuthorization {
  id: string | null;
  /** Raw, untrusted status value from PayPal; not a success signal. */
  status: unknown;
}

function extractAuthorization(
  order: Record<string, unknown> | null,
): ExtractedAuthorization {
  if (!order) return { id: null, status: undefined };
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  for (const unit of units) {
    if (!unit || typeof unit !== "object") continue;
    const payments = (unit as Record<string, unknown>).payments;
    if (!payments || typeof payments !== "object") continue;
    const authorizations = Array.isArray(
      (payments as Record<string, unknown>).authorizations,
    )
      ? ((payments as Record<string, unknown>).authorizations as unknown[])
      : [];
    for (const authorization of authorizations) {
      if (!authorization || typeof authorization !== "object") continue;
      const record = authorization as Record<string, unknown>;
      if (typeof record.id === "string" && record.id.trim() !== "") {
        return { id: record.id, status: record.status };
      }
    }
  }
  return { id: null, status: undefined };
}

// ---------------------------------------------------------------------------
// Webhook verification (helpers only; the endpoint is deferred — see docs).
// ---------------------------------------------------------------------------

export interface WebhookVerificationInput {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
  event: unknown;
}

/**
 * Thrown when webhook signature verification could not be completed because of
 * an infrastructure problem (transport failure, timeout, or an HTTP error from
 * the PayPal API). In that case the signature's validity is UNKNOWN, so the
 * webhook endpoint must respond 5xx so PayPal retries the delivery. This is
 * distinct from a clean verification response of anything other than SUCCESS,
 * which is a definitive invalid signature (4xx, never retried).
 */
export class WebhookVerificationError extends Error {
  constructor(message = "PayPal webhook signature could not be verified") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Verify a webhook signature with PayPal using the configured webhook id.
 * Returns true only when PayPal responds with verification_status SUCCESS.
 * Fails closed: missing config or fields, or any non-SUCCESS response, is false.
 * Throws {@link WebhookVerificationError} when verification could not be
 * completed (transport failure or PayPal API error) — callers must respond 5xx
 * so the provider retries the delivery.
 */
export async function verifyWebhookSignature(
  config: PayPalConfig,
  input: WebhookVerificationInput,
  transport: HttpTransport,
): Promise<boolean> {
  if (!config.webhookId) return false;
  if (
    !input.authAlgo ||
    !input.certUrl ||
    !input.transmissionId ||
    !input.transmissionSig ||
    !input.transmissionTime ||
    input.event === undefined
  ) {
    return false;
  }

  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");
  let token: string;
  try {
    const tokenResponse = await transport({
      method: "POST",
      url: `${SANDBOX_API}/v1/oauth2/token`,
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = tokenResponse.text
      ? (JSON.parse(tokenResponse.text) as Record<string, unknown>)
      : null;
    if (!tokenResponse.ok || !tokenData || typeof tokenData.access_token !== "string") {
      throw new WebhookVerificationError();
    }
    token = tokenData.access_token;
  } catch (error) {
    if (error instanceof WebhookVerificationError) throw error;
    throw new WebhookVerificationError();
  }

  try {
    const response = await transport({
      method: "POST",
      url: `${SANDBOX_API}/v1/notifications/verify-webhook-signature`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        auth_algo: input.authAlgo,
        cert_url: input.certUrl,
        transmission_id: input.transmissionId,
        transmission_sig: input.transmissionSig,
        transmission_time: input.transmissionTime,
        webhook_id: config.webhookId,
        webhook_event: input.event,
      }),
    });
    if (!response.ok || !response.text) {
      throw new WebhookVerificationError();
    }
    const data = JSON.parse(response.text) as Record<string, unknown>;
    if (data.verification_status === "SUCCESS") return true;
    // A clean non-SUCCESS response is a definitive invalid signature.
    return false;
  } catch (error) {
    if (error instanceof WebhookVerificationError) throw error;
    throw new WebhookVerificationError();
  }
}

export type WebhookEventKind =
  | "authorization_created"
  | "authorization_voided"
  | "capture_completed"
  | "capture_pending"
  | "unknown";

export interface NormalizedWebhookEvent {
  kind: WebhookEventKind;
  id: string | null;
  orderId: string | null;
  amountCents: number | null;
  currency: string | null;
}

/**
 * Pure mapping from a PayPal webhook event to a neutral descriptor. No side
 * effects, no trust decision — callers must verify the signature first and must
 * not let event contents authorize anything on their own.
 */
export function mapWebhookEvent(event: unknown): NormalizedWebhookEvent {
  const empty: NormalizedWebhookEvent = {
    kind: "unknown",
    id: null,
    orderId: null,
    amountCents: null,
    currency: null,
  };
  if (!event || typeof event !== "object") return empty;
  const record = event as Record<string, unknown>;
  const eventType = typeof record.event_type === "string" ? record.event_type : "";
  const resource =
    record.resource && typeof record.resource === "object"
      ? (record.resource as Record<string, unknown>)
      : {};

  const id = typeof resource.id === "string" ? resource.id : null;

  let orderId: string | null = null;
  const supplementary =
    resource.supplementary_data && typeof resource.supplementary_data === "object"
      ? (resource.supplementary_data as Record<string, unknown>)
      : null;
  const relatedIds =
    supplementary?.related_ids && typeof supplementary.related_ids === "object"
      ? (supplementary.related_ids as Record<string, unknown>)
      : null;
  if (relatedIds && typeof relatedIds.order_id === "string") {
    orderId = relatedIds.order_id;
  }

  let amountCents: number | null = null;
  let currency: string | null = null;
  const amount =
    resource.amount && typeof resource.amount === "object"
      ? (resource.amount as Record<string, unknown>)
      : null;
  if (amount) {
    const value = amount.value;
    const code = amount.currency_code;
    if (typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value)) {
      amountCents = Math.round(parseFloat(value) * 100);
    }
    currency = typeof code === "string" ? code : null;
  }

  const kind: WebhookEventKind =
    eventType === "PAYMENT.AUTHORIZATION.CREATED"
      ? "authorization_created"
      : eventType === "PAYMENT.AUTHORIZATION.VOIDED"
        ? "authorization_voided"
        : eventType === "PAYMENT.CAPTURE.COMPLETED"
          ? "capture_completed"
          : eventType === "PAYMENT.CAPTURE.PENDING"
            ? "capture_pending"
            : "unknown";

  return { kind, id, orderId, amountCents, currency };
}
