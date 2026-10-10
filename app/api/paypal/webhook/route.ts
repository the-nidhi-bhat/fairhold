import { handlePaypalWebhookRequest } from "@/lib/payments/webhook-endpoint";
import { readPayPalConfig } from "@/lib/payments/config";

/**
 * PayPal webhook listener (POST only).
 *
 * Signature verification, durable idempotent processing and fail-closed
 * response codes live in handlePaypalWebhookRequest(); this file is a thin
 * wrapper that supplies the server environment configuration.
 *
 * Note: the nodejs runtime is the default for route handlers in this app and
 * cannot be set via segment config while `cacheComponents` is enabled.
 */
export async function POST(request: Request): Promise<Response> {
  return handlePaypalWebhookRequest(request, {
    config: readPayPalConfig(process.env),
  });
}

export async function GET(): Promise<Response> {
  return new Response("Method not allowed", { status: 405 });
}