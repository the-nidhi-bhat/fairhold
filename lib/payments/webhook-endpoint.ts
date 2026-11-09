/**
 * PayPal webhook HTTP endpoint logic, isolated from Next.js so it is unit
 * testable without a server. The route handler (app/api/paypal/webhook/route.ts)
 * is a thin wrapper around handlePaypalWebhookRequest().
 *
 * Fail-closed contract:
 *
 *   - Missing/placeholder configuration            -> 503 (not configured)
 *   - JSON dev store backend                       -> 503 (needs the PG inbox)
 *   - Body too large / malformed JSON / bad header -> 4xx (permanent, never
 *     retried by PayPal)
 *   - Signature verification FAILED                -> 400 (definitive invalid)
 *   - Verification infrastructure error            -> 500 (PayPal retries)
 *   - Database/processing failure                  -> 500 (PayPal retries)
 *   - Anything else (processed/duplicate/
 *     quarantined/unsupported)                     -> 200 after COMMIT
 *
 * We never log transmission headers, signatures, payloads or secrets — only a
 * sanitized one-line summary (event id, type, outcome, status).
 */
import { createFetchTransport } from "./transport.ts";
import { verifyWebhookSignature, type WebhookVerificationInput } from "./paypal.ts";
import type { PayPalConfig } from "./config.ts";
import { processWebhookEvent, type WebhookProcessOutcome } from "../data/postgres/webhooks.ts";
import { resolveDataBackend } from "../data/db.ts";

/** Cap on the raw webhook body; PayPal events are far smaller. */
export const WEBHOOK_MAX_BODY_CHARS = 1_000_000;

const TRANSMISSION_HEADERS = [
  "paypal-transmission-id",
  "paypal-transmission-time",
  "paypal-cert-url",
  "paypal-auth-algo",
  "paypal-transmission-sig",
] as const;

export interface WebhookEndpointDeps {
  /** PayPal config; omit to force the 503 "not configured" path in tests. */
  config?: PayPalConfig | null;
  /** Data backend name; defaults to resolveDataBackend(). */
  backend?: string;
  /** Signature verification; defaults to the real PayPal postback check. */
  verifySignature?: (input: WebhookVerificationInput) => Promise<boolean>;
  /** Durable processing; defaults to the PostgreSQL inbox engine. */
  processEvent?: (event: unknown) => Promise<WebhookProcessOutcome>;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Handle one webhook delivery. Returns the Response to send to PayPal.
 */
export async function handlePaypalWebhookRequest(
  request: Request,
  deps: WebhookEndpointDeps = {},
): Promise<Response> {
  const config = deps.config === undefined ? null : deps.config;
  if (!config || !config.webhookId) {
    return jsonResponse({ error: "webhook not configured" }, 503);
  }

  const backend = deps.backend ?? resolveDataBackend();
  if (backend !== "postgres") {
    return jsonResponse({ error: "webhook processing requires PostgreSQL" }, 503);
  }

  // ---- read and shape the request -------------------------------------
  // Reject oversized bodies before allocating memory: check Content-Length
  // first (cheap, no allocation), then enforce a hard byte cap on the read.
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const len = Number.parseInt(contentLength, 10);
    if (!Number.isFinite(len) || len > WEBHOOK_MAX_BODY_CHARS) {
      return jsonResponse({ error: "request body too large" }, 413);
    }
  }

  let raw: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      return jsonResponse({ error: "invalid request body" }, 400);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > WEBHOOK_MAX_BODY_CHARS) {
          return jsonResponse({ error: "request body too large" }, 413);
        }
        chunks.push(value);
      }
    }
    raw = new TextDecoder().decode(Buffer.concat(chunks));
  } catch {
    return jsonResponse({ error: "invalid request body" }, 400);
  }

  for (const header of TRANSMISSION_HEADERS) {
    if (!request.headers.get(header)) {
      return jsonResponse({ error: "missing transmission headers" }, 400);
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return jsonResponse({ error: "malformed JSON payload" }, 400);
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as Record<string, unknown>).id !== "string" ||
    (payload as Record<string, unknown>).id === ""
  ) {
    return jsonResponse({ error: "invalid event payload" }, 400);
  }
  const record = payload as Record<string, unknown>;
  const eventId = record.id as string;
  const eventType = typeof record.event_type === "string" ? record.event_type : "unknown";

  // ---- verify the signature (fails closed) ----------------------------
  const verify = deps.verifySignature ?? ((input) =>
    verifyWebhookSignature(config, input, createFetchTransport()));
  let valid: boolean;
  try {
    valid = await verify({
      authAlgo: request.headers.get("paypal-auth-algo"),
      certUrl: request.headers.get("paypal-cert-url"),
      transmissionId: request.headers.get("paypal-transmission-id"),
      transmissionSig: request.headers.get("paypal-transmission-sig"),
      transmissionTime: request.headers.get("paypal-transmission-time"),
      event: payload,
    });
  } catch {
    console.error(`[webhook] verification infra error: event=${eventId} type=${eventType} status=500`);
    return jsonResponse({ error: "webhook verification failed" }, 500);
  }
  if (!valid) {
    console.error(`[webhook] signature rejected: event=${eventId} type=${eventType} status=400`);
    return jsonResponse({ error: "invalid webhook signature" }, 400);
  }

  // ---- durable, idempotent processing ---------------------------------
  const process = deps.processEvent ?? processWebhookEvent;
  let outcome: WebhookProcessOutcome;
  try {
    outcome = await process(payload);
  } catch {
    console.error(`[webhook] processing error: event=${eventId} type=${eventType} status=500`);
    return jsonResponse({ error: "webhook processing failed" }, 500);
  }

  console.log(
    `[webhook] ok event=${eventId} type=${eventType} outcome=${outcome.outcome}` +
      (outcome.outcome === "quarantined" || outcome.outcome === "unsupported"
        ? ` reason=${outcome.reason}`
        : ""),
  );
  return jsonResponse({ received: true, outcome: outcome.outcome }, 200);
}